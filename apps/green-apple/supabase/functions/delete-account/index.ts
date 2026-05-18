import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // 요청자 JWT로 user_id 확인
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401 })

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) return new Response('Unauthorized', { status: 401 })

    // service_role로 실제 삭제 (admin 권한 필요)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 연관 데이터 삭제 (profiles는 CASCADE로 연결되어 있지 않으므로 명시적으로)
    await adminClient.from('meal_logs').delete().eq('user_id', user.id)
    await adminClient.from('exercise_logs').delete().eq('user_id', user.id)
    await adminClient.from('weight_logs').delete().eq('user_id', user.id)
    await adminClient.from('feedbacks').update({ user_id: null }).eq('user_id', user.id)
    await adminClient.from('profiles').delete().eq('id', user.id)

    // auth.users 삭제
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
