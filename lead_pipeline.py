import requests
from bs4 import BeautifulSoup
import os

# API Keys & Configurations
MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY", "")
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN", "")
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "")

def scrape_leads(url):
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')
    leads = []
    for link in soup.find_all('a'):
        href = link.get('href', '')
        if 'mailto:' in href:
            leads.append(href.replace('mailto:', ''))
    return leads

def send_outreach_email(to_address, subject, body):
    return requests.post(
        f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
        auth=("api", MAILGUN_API_KEY),
        data={
            "from": f"Lead Engine <mailgun@{MAILGUN_DOMAIN}>",
            "to": [to_address],
            "subject": subject,
            "text": body
        }
    )

def main():
    print("Starting lead generation pipeline...")
    leads = scrape_leads("https://example.com/contacts")
    for lead in leads:
        send_outreach_email(lead, "Special Offer", "Check out our services!")

if __name__ == "__main__":
    main()
