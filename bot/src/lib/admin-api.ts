// HTTP-клиенты админ-бота — backend admin API и Docker socket.
// Вынесено из admin-bot.ts, чтобы docker.ts/admin-format.ts могли их использовать
// без импорта самого admin-bot.ts (там регистрируются команды — импортировать
// его ради клиента means выполнить весь файл целиком).
import axios from 'axios';

const API_URL    = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const BOT_SECRET = process.env.BOT_SECRET ?? '';

export const api = axios.create({
  baseURL: `${API_URL}/api/admin`,
  headers: { 'x-bot-secret': BOT_SECRET },
  timeout: 15_000,
  proxy: false, // в обход HTTP_PROXY — внутренний Docker-хост через прокси недостижим
});

export const docker = axios.create({
  socketPath: '/var/run/docker.sock',
  baseURL: 'http://localhost',
  timeout: 30_000,
});
