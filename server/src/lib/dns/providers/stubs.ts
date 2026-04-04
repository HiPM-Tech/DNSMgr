import { StubAdapter } from './common';

export class HuaweiAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('huawei'); }
}

export class BaiduAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('baidu'); }
}

export class HuoshanAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('huoshan'); }
}

export class JdcloudAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('jdcloud'); }
}

export class DnslaAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('dnsla'); }
}

export class WestAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('west'); }
}

export class QingcloudAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('qingcloud'); }
}

export class NamesiloAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('namesilo'); }
}

export class BtAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('bt'); }
}

export class SpaceshipAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('spaceship'); }
}

export class PowerdnsAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('powerdns'); }
}

export class AliyunesaAdapter extends StubAdapter {
  constructor(_config: Record<string, string>) { super('aliyunesa'); }
}
