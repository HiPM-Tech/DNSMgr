const fetch = require('node-fetch');

const API_KEY = 'cfsd_51b650cd9da564ca8e64760b8e8a0a4a';
const API_SECRET = 'b7ae13a5061e83582ee0cc3020408d96f69261b4546b7b49ee1dbcdec01c2f7d';
const BASE_URL = 'https://api005.dnshe.com/index.php';

async function testAPI() {
  console.log('Testing DNSHE API...\n');

  // Test 1: List subdomains
  console.log('1. Testing list subdomains...');
  try {
    const res = await fetch(`${BASE_URL}?m=domain_hub&endpoint=subdomains&action=list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-API-Secret': API_SECRET,
      },
    });
    
    const data = await res.json();
    console.log('Success:', data.success);
    if (data.subdomains && data.subdomains.length > 0) {
      console.log('First subdomain:', JSON.stringify(data.subdomains[0], null, 2));
      console.log('\nFull domain construction:');
      const item = data.subdomains[0];
      const fullDomain = item.subdomain === '@' 
        ? item.rootdomain 
        : `${item.subdomain}.${item.rootdomain}`;
      console.log(`  subdomain: ${item.subdomain}`);
      console.log(`  rootdomain: ${item.rootdomain}`);
      console.log(`  full_domain (from API): ${item.full_domain}`);
      console.log(`  constructed: ${fullDomain}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n---\n');

  // Test 2: Get DNS records for a subdomain
  if (false) { // Disable for now
    console.log('2. Testing get DNS records...');
    try {
      const res = await fetch(`${BASE_URL}?m=domain_hub&endpoint=dns_records&action=list&subdomain_id=1`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
          'X-API-Secret': API_SECRET,
        },
      });
      
      const data = await res.json();
      console.log('Success:', data.success);
      if (data.records && data.records.length > 0) {
        console.log('First record:', JSON.stringify(data.records[0], null, 2));
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

testAPI().catch(console.error);
