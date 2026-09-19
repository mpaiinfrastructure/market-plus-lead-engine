const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { getProviderConfig } = require('./config');

const dataDir = getProviderConfig().app.dataDir;

const TARGET_ZIPS = getProviderConfig().highIncomeZips;
const SEARCH_TERM = process.env.LEAD_SEARCH_TERM || 'businesses';
const AI_KEYWORDS = ['vapi', 'bland.ai', 'openai', 'chatgpt', 'intercom', 'livechat', 'drift', 'chatbot'];

function normalizeUrl(url) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}

function extractPhoneNumber(text) {
  const match = (text || '').match(/\+?\d[\d\s().-]{8,}\d/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : '';
}

async function pageHasAIInfrastructure(url) {
  try {
    const response = await axios.get(normalizeUrl(url), { timeout: 8000, validateStatus: () => true });
    const source = response.data || '';
    const content = (source || '').toLowerCase();
    return AI_KEYWORDS.some((keyword) => content.includes(keyword));
  } catch {
    return false;
  }
}

function parseBusinessLinks(html) {
  const $ = cheerio.load(html);
  const links = [];

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const normalized = normalizeUrl(href);
    if (!normalized) return;
    if (normalized.includes('yellowpages.com') || normalized.includes('google.com') || normalized.includes('facebook.com')) {
      return;
    }
    links.push(normalized);
  });

  return dedupe(links).slice(0, 20);
}

async function scrapeBusinessLeadsForZip(zip) {
  const results = [];

  const targetUrl = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(SEARCH_TERM)}&geo_location_terms=${zip}`;

  try {
    const response = await axios.get(targetUrl, { timeout: 15000, validateStatus: () => true });
    const links = parseBusinessLinks(response.data);

    for (const website of links) {
      const hasAI = await pageHasAIInfrastructure(website);
      if (hasAI) continue;

      const pageResponse = await axios.get(website, { timeout: 8000, validateStatus: () => true });
      const $ = cheerio.load(pageResponse.data);
      const name = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || website.replace(/^https?:\/\//, '').split('/')[0];
      const phone = extractPhoneNumber($('body').text()) || extractPhoneNumber($('script').text()) || '';

      results.push({
        name: name || 'Unknown Business',
        phone,
        website,
        zip,
        businessType: 'Unknown',
        aiReady: false,
      });
    }
  } catch (error) {
    console.warn(`Unable to inspect ZIP ${zip}: ${error.message}`);
  }

  return results;
}

async function runApifyCapture() {
  const providers = getProviderConfig();
  if (!providers.apify.apiToken) {
    return [];
  }

  try {
    const { ApifyClient } = require('apify-client');
    const client = new ApifyClient({ token: providers.apify.apiToken });
    const run = await client.actor('apify/website-scraper').call({
      startUrls: [{ url: 'https://www.yellowpages.com' }],
    });

    return await client.dataset(run.defaultDatasetId).listItems().then((result) => result.items || []);
  } catch (error) {
    console.warn(`Apify fallback failed: ${error.message}`);
    return [];
  }
}

async function runPipeline() {
  const leads = [];
  const apifyLeads = await runApifyCapture();

  if (apifyLeads.length > 0) {
    for (const lead of apifyLeads) {
      const record = {
        name: lead.name || lead.title || 'Unknown Business',
        phone: lead.phone || '',
        website: lead.url || lead.website || '',
        zip: lead.zip || 'unknown',
        businessType: lead.businessType || 'Unknown',
        aiReady: false,
      };
      if (record.website || record.phone) leads.push(record);
    }
  }

  for (const zip of TARGET_ZIPS) {
    const zipLeads = await scrapeBusinessLeadsForZip(zip);
    for (const lead of zipLeads) {
      const exists = leads.some((item) => item.website === lead.website || item.phone === lead.phone);
      if (!exists) leads.push(lead);
    }
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'high_value_leads.json'), JSON.stringify(leads, null, 2));
  console.log(`Market Plus Engine: Scraped ${leads.length} businesses without detected AI infrastructure.`);
}

runPipeline().catch((err) => {
  console.error('Scrape pipeline failed:', err);
  process.exit(1);
});
