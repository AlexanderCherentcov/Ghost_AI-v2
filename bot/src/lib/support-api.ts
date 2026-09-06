// HTTP-клиент support-bot к backend (/api/admin/support/*). Отдельный секрет
// от admin-api.ts — support-bot не должен иметь доступ к реальным /admin/*
// эндпоинтам (тарифы, Caspers, бан), только к тикетам поддержки.
import axios from 'axios';

const API_URL            = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const SUPPORT_BOT_SECRET = process.env.SUPPORT_BOT_SECRET ?? '';

export const api = axios.create({
  baseURL: `${API_URL}/api/admin`,
  headers: { 'x-support-bot-secret': SUPPORT_BOT_SECRET },
  timeout: 15_000,
  proxy: false, // в обход HTTP_PROXY — внутренний Docker-хост через прокси недостижим
});
