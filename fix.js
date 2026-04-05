const fs = require('fs');
const p = './client/src/api/index.ts';
let code = fs.readFileSync(p, 'utf-8');

code = code.replace(
`// ─── Tunnels ──────────────────────────────────────────────────────────────────
export const tunnelsApi = {
  list: () => api.get<ApiResponse<any[]>>('/tunnels'),
  getConfig: (accountId: string, tunnelId: string) => api.get<ApiResponse<any>>(\`/tunnels/\${accountId}/\${tunnelId}\`),
  updateConfig: (accountId: string, tunnelId: string, config: any) => api.put<ApiResponse<any>>(\`/tunnels/\${accountId}/\${tunnelId}/config\`, { config }),
  delete: (accountId: string, tunnelId: string) => api.delete<ApiResponse<any>>(\`/tunnels/\${accountId}/\${tunnelId}\`),
};

export const accountsApi = {
  providers: () => api.get<ApiResponse<Provider[]>>('/accounts/providers'),`,
`// ─── Tunnels ──────────────────────────────────────────────────────────────────
export const tunnelsApi = {
  list: () => api.get<ApiResponse<any[]>>('/tunnels'),
  getConfig: (accountId: string, tunnelId: string) => api.get<ApiResponse<any>>(\`/tunnels/\${accountId}/\${tunnelId}\`),
  updateConfig: (accountId: string, tunnelId: string, config: any) => api.put<ApiResponse<any>>(\`/tunnels/\${accountId}/\${tunnelId}/config\`, { config }),
  delete: (accountId: string, tunnelId: string) => api.delete<ApiResponse<any>>(\`/tunnels/\${accountId}/\${tunnelId}\`),
};

export const accountsApi = {
  list: () => api.get<ApiResponse<DnsAccount[]>>('/accounts'),
  providers: () => api.get<ApiResponse<Provider[]>>('/accounts/providers'),`
);

fs.writeFileSync(p, code);
