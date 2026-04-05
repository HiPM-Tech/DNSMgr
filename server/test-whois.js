import('whoiser').then(async m => {
  const info = await m.whoisDomain('example.com');
  const first = m.firstResult(info);
  console.log(first);
});
