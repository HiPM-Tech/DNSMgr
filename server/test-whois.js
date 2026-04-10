import { whoisDomain, firstResult } from 'whoiser';

/**
 * 获取域名的根域名（注册域名）
 * 例如：blog.example.com -> example.com
 */
function getRootDomain(domainName) {
  const parts = domainName.toLowerCase().split('.');
  // 如果只有两部分或更少，直接返回
  if (parts.length <= 2) return domainName;

  // 处理常见的二级后缀
  const specialSuffixes = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'co.uk', 'org.uk', 'net.uk'];
  const lastThree = parts.slice(-3).join('.');

  if (specialSuffixes.includes(lastThree)) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

async function checkWhoisForDomain(domainName) {
  try {
    const rootDomain = getRootDomain(domainName);
    if (rootDomain !== domainName) {
      console.log(`Querying root domain ${rootDomain} for ${domainName}`);
    }

    const domainWhois = await whoisDomain(rootDomain, { follow: 1 });
    const firstFoundWhois = firstResult(domainWhois);
    if (!firstFoundWhois) {
      console.log(`No whois result found for ${domainName}`);
      return null;
    }

    const possibleExpiryKeys = [
      'Registry Expiry Date',
      'Expiry Date',
      'Registrar Registration Expiration Date',
      'Expiration Date',
      'expires',
      'Expiration Time',
      'paid-till',
      'Renewal Date'
    ];

    for (const key of possibleExpiryKeys) {
      const expiryStr = firstFoundWhois[key];
      if (expiryStr) {
        const d = new Date(expiryStr);
        if (!isNaN(d.getTime())) {
          console.log(`Found expiry for ${domainName}: ${d.toISOString()}`);
          return d;
        }
      }
    }

    console.log(`No expiry date found for ${domainName}`);
  } catch (error) {
    console.log(`Error for ${domainName}:`, error.message);
  }
  return null;
}

// 测试各种域名
const testDomains = [
  'example.com',
  'blog.example.com',
  'www.example.com',
  'baidu.com',
  'cloud.tencent.com',
  'test.co.uk',
  'test.com.cn'
];

(async () => {
  for (const domain of testDomains) {
    console.log(`\n========== Testing: ${domain} ==========`);
    const rootDomain = getRootDomain(domain);
    console.log(`Root domain: ${rootDomain}`);
    await checkWhoisForDomain(domain);
    await new Promise(r => setTimeout(r, 1000));
  }
})();
