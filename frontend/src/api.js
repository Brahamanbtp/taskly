// frontend/src/api.js
import { supabase } from './supabaseClient'

/*
  Helper wrappers for Taskly:
  - signUp(email, password)
  - signIn(email, password)
  - signOut()
  - getCurrentUser()
  - createTask(title)
  - listTasks()
  - updateTaskStatus(id, status)
  - editTaskTitle(id, title)
  - deleteTask(id)
*/

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { data, error }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getCurrentUser() {
  try {
    const r = await supabase.auth.getUser();
    // supabase v2 returns { data: { user } }
    return r?.data?.user ?? null;
  } catch (err) {
    console.error('getCurrentUser err', err);
    return null;
  }
}

/* TASKS */

export async function createTask(title) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return { error: new Error('Not authenticated') }
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ title, user_id: user.id }])
    .select()
  return { data, error }
}

export async function listTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function updateTaskStatus(id, status) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
  return { data, error }
}

export async function editTaskTitle(id, title) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
  return { data, error }
}

export async function deleteTask(id) {
  const { data, error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .select()
  return { data, error }
}
