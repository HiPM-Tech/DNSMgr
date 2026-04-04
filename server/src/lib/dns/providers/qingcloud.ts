import crypto from 'node:crypto';
import { DnsAdapter, DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import { BaseAdapter, Dict, safeString, toNumber } from './common';

interface QingcloudConfig {
  access_key_id: string;
  secret_access_key: string;
  domain?: string;
  domainId?: string;
}

export class QingcloudAdapter extends BaseAdapter {
  private config: QingcloudConfig;
  private baseUrl = 'http://api.routewize.com';

  constructor(config: Record<string, string>) {
    super();
    this.config = {
      access_key_id: safeString(config.access_key_id),
      secret_access_key: safeString(config.secret_access_key),
      domain: safeString(config.domain),
      domainId: safeString(config.zoneId),
    };
  }

  private async request<T>(method: string, path: string, params?: Dict): Promise<T> {
    const date = new Date().toUTCString();
    let stringToSign = `${method}\n${date}\n${path}`;

    let url = `${this.baseUrl}${path}`;
    let body: string | undefined;

    if (method === 'GET' && params) {
      const sortedParams = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
      const queryString = sortedParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
      stringToSign += '?' + queryString;
      url += '?' + queryString;
    } else if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      body = JSON.stringify(params);
    }

    const signature = crypto.createHmac('sha256', this.config.secret_access_key).update(stringToSign).digest('base64');
    const authorization = `QC-HMAC-SHA256 ${this.config.access_key_id}:${signature}`;

    const headers: Record<string, string> = {
      Authorization: authorization,
      Date: date,
    };

    if (body) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    const res = await fetch(url, { method, headers, body });
    const data = (await res.json()) as Dict;

    if (res.status !== 200 && res.status !== 204) {
      throw new Error(safeString(data.message) || safeString(data.msg) || `Qingcloud request failed: ${res.status}`);
    }

    if (data.code !== undefined && data.code !== 0 && !data.domains) {
      throw new Error(safeString(data.message) || safeString(data.msg) || '返回数据解析失败');
    }

    return data as T;
  }

  async check(): Promise<boolean> {
    try {
      await this.getDomainList();
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getDomainList(keyword?: string, page = 1, pageSize = 20): Promise<PageResult<DomainInfo>> {
    try {
      const offset = (page - 1) * pageSize;
      const params: Dict = { offset, limit: pageSize };
      if (keyword) {
        params.zone_name = keyword;
      }

      const data = await this.request<{ zones: Array<{ zone_name: string }>; total_count: number }>('GET', '/v1/user/zones', params);
      let list = (data.zones || []).map((row) => ({
        Domain: row.zone_name.replace(/\.$/, ''),
        ThirdId: row.zone_name,
        RecordCount: 0,
      }));
      if (keyword) {
        list = list.filter((d) => d.Domain.toLowerCase().includes(keyword.toLowerCase()));
      }
      return { total: data.total_count || list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecords(
    page = 1,
    pageSize = 20,
    keyword?: string,
    subdomain?: string,
    _value?: string,
    _type?: string,
    _line?: string,
    _status?: number
  ): Promise<PageResult<DnsRecord>> {
    try {
      if (!this.config.domainId) {
        return { total: 0, list: [] };
      }

      if (subdomain) {
        return this.getHostRecords(subdomain);
      }

      const offset = (page - 1) * pageSize;
      const params: Dict = { zone_name: this.config.domainId, offset, limit: pageSize };
      if (keyword) {
        params.search_word = keyword;
      }

      const data = await this.request<{ domains: Array<Dict>; total_count: number }>('GET', '/v1/dns/host/', params);
      const list = (data.domains || []).map((row) => {
        const zoneName = safeString(row.zone_name);
        let name = safeString(row.domain_name).replace(`.${zoneName}`, '');
        if (name === '') name = '@';

        return {
          RecordId: row.domain_name,
          Domain: this.config.domain || '',
          Name: name,
          Type: null as unknown as string,
          Value: null as unknown as string,
          Line: null as unknown as string,
          TTL: null as unknown as number,
          MX: null as unknown as number,
          Status: row.status === 'enabled' ? 0 : 1,
          Weight: null as unknown as number,
          Remark: safeString(row.description) || undefined,
          UpdateTime: safeString(row.create_time) || undefined,
          Count: toNumber(row.count, 0),
        } as DnsRecord;
      });

      return { total: data.total_count || list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  private async getHostRecords(subdomain: string): Promise<PageResult<DnsRecord>> {
    try {
      if (!this.config.domainId) {
        return { total: 0, list: [] };
      }

      const host = this.getHost(subdomain);
      const data = await this.request<{ records: Array<Dict>; total_count: number }>('GET', '/v1/dns/host_info/', { zone_name: this.config.domainId, domain_name: host });
      const list: DnsRecord[] = [];

      for (const record of data.records || []) {
        const zoneName = safeString(record.zone_name);
        let name = safeString(record.domain_name).replace(`.${zoneName}`, '');
        if (name === '') name = '@';

        for (const recordGroup of (record.record as Dict[]) || []) {
          for (const row of ((recordGroup as Dict).data as Dict[]) || []) {
            let value = safeString(row.value);
            let mx: number | undefined;

            if (record.rd_type === 'MX') {
              const parts = value.split(' ', 2);
              mx = toNumber(parts[0], 0);
              value = parts[1] || '';
            }
            if (record.rd_type === 'TXT') {
              value = value.replace(/^"|"$/g, '');
            }

            list.push({
              RecordId: `${record.domain_record_id}_${row.record_value_id}`,
              Domain: record.domain_name,
              Name: name,
              Type: record.rd_type,
              Mode: record.mode,
              Value: value,
              Line: safeString(record.view_id),
              TTL: toNumber(record.ttl, 600),
              MX: mx,
              Status: row.status === 1 ? 1 : 0,
              Weight: (recordGroup.weight as number) > 0 ? toNumber(recordGroup.weight as number, 0) : undefined,
              Remark: undefined,
              UpdateTime: safeString(record.create_time) || undefined,
            } as DnsRecord);
          }
        }
      }

      return { total: data.total_count || list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecordInfo(_recordId: string): Promise<DnsRecord | null> {
    return null;
  }

  async addDomainRecord(
    name: string,
    type: string,
    value: string,
    line?: string,
    ttl = 600,
    mx = 1,
    weight?: number,
    _remark?: string
  ): Promise<string | null> {
    try {
      if (!this.config.domainId) {
        return null;
      }

      let recordValue = value;
      if (type === 'MX') {
        recordValue = `${mx} ${value}`;
      } else if (type === 'TXT' && !recordValue.startsWith('"')) {
        recordValue = `"${recordValue}"`;
      }

      const values = recordValue.split(',').map((val) => ({ value: val.trim(), status: 1 }));
      const recordWeight = (type === 'A' || type === 'CNAME') && weight ? toNumber(weight, 0) : 0;
      const record = [{ weight: recordWeight, values }];

      const params: Dict = {
        zone_name: this.config.domainId,
        domain_name: name,
        view_id: toNumber(line, 0),
        type,
        ttl: toNumber(ttl, 600),
        record: JSON.stringify(record),
        mode: 1,
        auto_merge: 2,
      };

      const data = await this.request<{ domain_record_id: string }>('POST', '/v1/record/', params);
      return data.domain_record_id || null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async updateDomainRecord(
    recordId: string,
    name: string,
    type: string,
    value: string,
    line?: string,
    ttl = 600,
    mx = 1,
    weight?: number,
    _remark?: string
  ): Promise<boolean> {
    try {
      if (!this.config.domainId) {
        return false;
      }

      let recordValue = value;
      if (type === 'MX') {
        recordValue = `${mx} ${value}`;
      } else if (type === 'TXT' && !recordValue.startsWith('"')) {
        recordValue = `"${recordValue}"`;
      }

      const [domainRecordId, recordValueId] = recordId.split('_');
      const data = await this.request<{ data: { record: Array<{ data: Array<{ record_value_id: string; value: string; status: number }>; weight: number }>; domain_name: string; zone_name: string; view_id: string; ttl: number; rd_type: string; mode: number } }>('GET', `/v1/dr_id/${domainRecordId}`);

      const recordWeight = (type === 'A' || type === 'CNAME') && weight ? toNumber(weight, 0) : 0;
      const record: Array<{ weight: number; values: Array<{ value: string; status: number }> }> = [];

      for (const recordGroup of data.data.record) {
        const values: Array<{ value: string; status: number }> = [];
        let flag = false;
        for (const row of recordGroup.data) {
          if (row.record_value_id === recordValueId) {
            row.value = recordValue;
            flag = true;
          }
          values.push({ value: row.value, status: row.status });
        }
        if (values.length > 0) {
          record.push({ weight: flag ? recordWeight : recordGroup.weight, values });
        }
      }

      const params: Dict = {
        zone_name: this.config.domainId,
        domain_name: name,
        view_id: toNumber(line, 0),
        type,
        ttl: toNumber(ttl, 600),
        record: JSON.stringify(record),
        mode: 1,
      };

      await this.request('POST', `/v1/dr_id/${domainRecordId}`, params);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      if (!this.config.domainId) {
        return false;
      }

      if (recordId.includes(this.config.domainId)) {
        await this.request('DELETE', '/v1/domain/', { domain_names: JSON.stringify([recordId]), zone_name: this.config.domainId });
        return true;
      }

      const [domainRecordId, recordValueId] = recordId.split('_');
      const data = await this.request<{ data: { record: Array<{ data: Array<{ record_value_id: string; value: string; status: number }>; weight: number }>; domain_name: string; zone_name: string; view_id: string; ttl: number; rd_type: string; mode: number } }>('GET', `/v1/dr_id/${domainRecordId}`);

      const record: Array<{ weight: number; values: Array<{ value: string; status: number }> }> = [];
      for (const recordGroup of data.data.record) {
        const values: Array<{ value: string; status: number }> = [];
        for (const row of recordGroup.data) {
          if (row.record_value_id === recordValueId) {
            continue;
          }
          values.push({ value: row.value, status: row.status });
        }
        if (values.length > 0) {
          record.push({ weight: recordGroup.weight, values });
        }
      }

      if (record.length === 0) {
        await this.request('POST', '/v1/change_record_status/', { ids: JSON.stringify([domainRecordId]), target: 'record', action: 'delete' });
        return true;
      }

      let name = safeString(data.data.domain_name).replace(`.${data.data.zone_name}`, '');
      if (name === '') name = '@';

      const params: Dict = {
        zone_name: this.config.domainId,
        domain_name: name,
        view_id: toNumber(data.data.view_id, 0),
        type: data.data.rd_type,
        ttl: toNumber(data.data.ttl, 600),
        record: JSON.stringify(record),
        mode: toNumber(data.data.mode, 1),
      };

      await this.request('POST', `/v1/dr_id/${domainRecordId}`, params);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async setDomainRecordStatus(recordId: string, status: number): Promise<boolean> {
    try {
      const [, recordValueId] = recordId.split('_');
      await this.request('POST', '/v1/change_record_status/', { ids: JSON.stringify([recordValueId]), target: 'value', action: status === 0 ? 'stop' : 'enable' });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    try {
      if (!this.config.domainId) {
        return this.getDefaultLines();
      }

      const data = await this.request<{ zone_views: Array<{ id: string; name: string }> }>('GET', '/v1/zone/view/', { zone_name: this.config.domainId, type: 'GET_FULL' });
      return (data.zone_views || []).map((row) => ({ id: row.id, name: row.name === '*' ? '默认' : row.name }));
    } catch (e) {
      return this.getDefaultLines();
    }
  }

  async getMinTTL(): Promise<number> {
    return 60;
  }

  async addDomain(domain: string): Promise<boolean> {
    try {
      await this.request('POST', '/v1/zone/', { zone_name: domain });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  private getHost(name: string): string {
    if (name === '@' || name === '') {
      return `${this.config.domain}.`;
    }
    return `${name}.${this.config.domain}.`;
  }

  private getDefaultLines(): Array<{ id: string; name: string }> {
    return [
      { id: '0', name: '默认' },
      { id: '1', name: '电信' },
      { id: '2', name: '联通' },
      { id: '3', name: '移动' },
      { id: '4', name: '教育网' },
    ];
  }
}
