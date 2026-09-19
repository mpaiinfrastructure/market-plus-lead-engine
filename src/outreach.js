const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getProviderConfig, getProviderStatus } = require('./config');

const dataDir = getProviderConfig().app.dataDir;

function buildPitchPrompt(lead) {
  return `
Hi, is this the owner of ${lead.name}?
My name is an automated assistant calling from Market Plus Automated Solutions.
We noticed you operate in the affluent ZIP code area ${lead.zip}, but your site does not appear to have any AI-powered lead capture or missed-call automation.
Industry data shows local service businesses lose 22% to 30% of inbound calls to voicemail, and 85% of those callers never leave a message.
That means high-value jobs are going to competitors while your team keeps paying for leads and missed opportunities.
For a business like yours, that can quietly leak between $3,800 and $10,000+ a month in missed revenue.
We solve that by installing an AI Receptionist and automated Missed Call Text Back system that captures, qualifies, and books leads instantly.
We also tailor the automation to the exact workflow you want, whether that is booking appointments, confirming estimates, or routing VIP jobs to the right person.
Would you like a no-pressure demo and a secure checkout link so we can deploy the exact automation you need today?
`;
}

async function sendSmsFollowUp(lead) {
  const { twilio } = getProviderConfig();
  if (!getProviderStatus().twilio) {
    return { dryRun: true, mode: 'sms', lead, note: 'Twilio not configured.' };
  }

  const client = require('twilio')(twilio.accountSid, twilio.authToken);
  const text = `Hi! This is Market Plus Automated Solutions. We help local service businesses capture missed calls and book more jobs. Would you like a quick AI demo? ${lead.website || 'https://example.com'}`;

  const message = await client.messages.create({
    body: text,
    from: twilio.phoneNumber,
    to: lead.phone || '',
  });

  return { dryRun: false, mode: 'sms', lead, sid: message.sid };
}

async function sendVoicePitch(lead) {
  const { deepgram } = getProviderConfig();
  const pitchPrompt = buildPitchPrompt(lead);

  if (!deepgram.apiKey) {
    console.log(`Market Plus Engine: Dry-run outreach for ${lead.name} -> ${pitchPrompt.trim()}`);
    return { dryRun: true, mode: 'voice', lead };
  }

  const sdk = require('@deepgram/sdk');
  const deepgramClient = new sdk.Deepgram(deepgram.apiKey);

  const response = await deepgramClient.speak.request({
    text: pitchPrompt,
    model: deepgram.ttsModel,
    voice: deepgram.voiceId,
  }, { timeout: 30000 });

  return { dryRun: false, mode: 'voice', lead, response };
}

async function dispatchVoiceOutreach() {
  const leadsPath = path.join(dataDir, 'high_value_leads.json');
  if (!fs.existsSync(leadsPath)) {
    console.log('Market Plus Engine: No leads found. Run the scraper first.');
    return;
  }

  const leads = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
  const log = [];

  for (const lead of leads) {
    try {
      const voiceResult = await sendVoicePitch(lead);
      const smsResult = await sendSmsFollowUp(lead);
      log.push({ lead, voiceResult, smsResult, timestamp: new Date().toISOString() });
      console.log(`Market Plus Engine: Outreach processed for ${lead.name}`);
    } catch (err) {
      log.push({ lead, error: err.message, timestamp: new Date().toISOString() });
      console.error(`Failed outreach for ${lead.name}: ${err.message}`);
    }
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'outreach_log.json'), JSON.stringify(log, null, 2));
}

dispatchVoiceOutreach().catch((err) => {
  console.error('Outreach workflow failed:', err);
  process.exit(1);
});
