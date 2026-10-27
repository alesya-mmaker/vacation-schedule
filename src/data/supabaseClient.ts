// Единственное место, где создаётся клиент Supabase.
// Импортировать этот файл можно только из src/data/.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !key) {
  throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (см. .env.example)')
}

export const supabase = createClient(url, key)

// Отдельный клиент для формы сотрудника: всегда без входа, даже если в этом браузере вошёл HR.
// Так форма видит ровно то, что видит сотрудник (например, без скрытых типов заявлений).
export const supabaseForm = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'form-without-login' },
})
