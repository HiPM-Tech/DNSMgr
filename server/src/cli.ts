#!/usr/bin/env node
/**
 * DNSMgr CLI 工具
 * 提供管理命令：禁用2FA、重置数据库配置等
 */

import { connect, disconnect, getConnection } from './db/core/connection';
import { UserOperations, TOTPOperations } from './db/business-adapter';
import { log } from './lib/logger';
import fs from 'fs';
import path from 'path';

const ENV_FILE = path.join(__dirname, '..', '.env');

interface Command {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<void>;
}

/**
 * 显示帮助信息
 */
function showHelp(commands: Command[]) {
  console.log('DNSMgr CLI Tool');
  console.log('Usage: node cli.js <command> [options]\n');
  console.log('Commands:');
  commands.forEach(cmd => {
    console.log(`  ${cmd.name.padEnd(20)} ${cmd.description}`);
  });
  console.log('\nExamples:');
  console.log('  node cli.js disable-2fa --username admin');
  console.log('  node cli.js reset-db-config --type sqlite');
  console.log('  node cli.js list-users');
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      result[key] = value;
      if (value !== 'true') i++;
    }
  }
  return result;
}

/**
 * 禁用用户 2FA
 */
async function disable2FA(args: string[]) {
  const params = parseArgs(args);
  const username = params.username || params.user;
  const userId = params.userId ? parseInt(params.userId) : null;

  if (!username && !userId) {
    console.error('Error: Please provide --username or --userId');
    process.exit(1);
  }

  try {
    // Initialize database connection
    await connect();

    let user: any;
    if (userId) {
      user = await UserOperations.getById(userId);
    } else if (username) {
      user = await UserOperations.getByUsername(username);
    }

    if (!user) {
      console.error('Error: User not found');
      process.exit(1);
    }

    console.log(`Found user: ${user.username} (ID: ${user.id})`);

    // Check if 2FA is enabled
    const twoFAStatus = await TOTPOperations.getByUser(user.id);
    if (!twoFAStatus || !(twoFAStatus as any).enabled) {
      console.log('2FA is not enabled for this user.');
      process.exit(0);
    }

    // Disable 2FA
    const enabledValue = process.env.DB_TYPE === 'sqlite' ? 0 : false;
    await TOTPOperations.disable(user.id, enabledValue);

    console.log(`✅ Successfully disabled 2FA for user: ${user.username}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

/**
 * 重置数据库配置
 */
async function resetDBConfig(args: string[]) {
  const params = parseArgs(args);
  const dbType = params.type || params.dbType || 'sqlite';

  if (!['sqlite', 'mysql', 'postgresql'].includes(dbType)) {
    console.error('Error: Invalid database type. Must be sqlite, mysql, or postgresql');
    process.exit(1);
  }

  try {
    let envContent = '';

    if (fs.existsSync(ENV_FILE)) {
      envContent = fs.readFileSync(ENV_FILE, 'utf-8');
    }

    // Parse existing env
    const envLines = envContent.split('\n').filter(line => line.trim());
    const envMap = new Map<string, string>();

    for (const line of envLines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        envMap.set(match[1], match[2]);
      }
    }

    // Update database configuration
    envMap.set('DB_TYPE', dbType);

    if (dbType === 'sqlite') {
      envMap.set('DB_PATH', params.path || './data/dnsmgr.db');
      // Remove other DB configs
      envMap.delete('DB_HOST');
      envMap.delete('DB_PORT');
      envMap.delete('DB_NAME');
      envMap.delete('DB_USER');
      envMap.delete('DB_PASSWORD');
    } else if (dbType === 'mysql') {
      envMap.set('DB_HOST', params.host || 'localhost');
      envMap.set('DB_PORT', params.port || '3306');
      envMap.set('DB_NAME', params.database || params.name || 'dnsmgr');
      envMap.set('DB_USER', params.user || 'root');
      envMap.set('DB_PASSWORD', params.password || '');
      envMap.delete('DB_PATH');
    } else if (dbType === 'postgresql') {
      envMap.set('DB_HOST', params.host || 'localhost');
      envMap.set('DB_PORT', params.port || '5432');
      envMap.set('DB_NAME', params.database || params.name || 'dnsmgr');
      envMap.set('DB_USER', params.user || 'postgres');
      envMap.set('DB_PASSWORD', params.password || '');
      envMap.delete('DB_PATH');
    }

    // Write back to file
    const newEnvContent = Array.from(envMap.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n';

    fs.writeFileSync(ENV_FILE, newEnvContent);

    console.log(`✅ Database configuration reset to: ${dbType}`);
    console.log('\nNew configuration:');
    console.log(`DB_TYPE=${dbType}`);

    if (dbType === 'sqlite') {
      console.log(`DB_PATH=${envMap.get('DB_PATH')}`);
    } else {
      console.log(`DB_HOST=${envMap.get('DB_HOST')}`);
      console.log(`DB_PORT=${envMap.get('DB_PORT')}`);
      console.log(`DB_NAME=${envMap.get('DB_NAME')}`);
      console.log(`DB_USER=${envMap.get('DB_USER')}`);
    }

    console.log('\n⚠️  Please restart the server for changes to take effect.');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * 列出所有用户
 */
async function listUsers(args: string[]) {
  try {
    await connect();

    const users = await UserOperations.getAll();

    console.log('\nUsers:');
    console.log('-'.repeat(80));
    console.log(`${'ID'.padEnd(6)} ${'Username'.padEnd(20)} ${'Email'.padEnd(30)} ${'Role'.padEnd(10)} ${'Status'}`);
    console.log('-'.repeat(80));

    for (const user of users) {
      const u = user as { id: number; username: string; email?: string; role: string; status: number };
      const status = u.status === 1 ? 'Active' : 'Disabled';
      console.log(
        `${String(u.id).padEnd(6)} ` +
        `${u.username.padEnd(20)} ` +
        `${(u.email || '').padEnd(30)} ` +
        `${u.role.padEnd(10)} ` +
        `${status}`
      );
    }

    console.log('-'.repeat(80));
    console.log(`Total: ${users.length} users`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

/**
 * 重置用户密码
 */
async function resetPassword(args: string[]) {
  const params = parseArgs(args);
  const username = params.username || params.user;
  const userId = params.userId ? parseInt(params.userId) : null;
  const newPassword = params.password;

  if (!username && !userId) {
    console.error('Error: Please provide --username or --userId');
    process.exit(1);
  }

  if (!newPassword) {
    console.error('Error: Please provide --password');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('Error: Password must be at least 6 characters');
    process.exit(1);
  }

  try {
    await connect();

    let user: any;
    if (userId) {
      user = await UserOperations.getById(userId);
    } else if (username) {
      user = await UserOperations.getByUsername(username);
    }

    if (!user) {
      console.error('Error: User not found');
      process.exit(1);
    }

    await UserOperations.updatePassword(user.id, newPassword);

    console.log(`✅ Successfully reset password for user: ${user.username}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

// Command definitions
const commands: Command[] = [
  {
    name: 'disable-2fa',
    description: 'Disable 2FA for a user (--username or --userId)',
    handler: disable2FA,
  },
  {
    name: 'reset-db-config',
    description: 'Reset database configuration (--type sqlite|mysql|postgresql)',
    handler: resetDBConfig,
  },
  {
    name: 'list-users',
    description: 'List all users',
    handler: listUsers,
  },
  {
    name: 'reset-password',
    description: 'Reset user password (--username or --userId, --password)',
    handler: resetPassword,
  },
];

// Main entry point
async function main() {
  const args = process.argv.slice(2);
  const commandName = args[0];

  if (!commandName || commandName === '--help' || commandName === '-h') {
    showHelp(commands);
    process.exit(0);
  }

  const command = commands.find(cmd => cmd.name === commandName);

  if (!command) {
    console.error(`Error: Unknown command "${commandName}"`);
    showHelp(commands);
    process.exit(1);
  }

  await command.handler(args.slice(1));
  process.exit(0);
}

main();
