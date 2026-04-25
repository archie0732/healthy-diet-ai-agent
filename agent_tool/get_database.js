/*
當使用者想要查詢、確認或修改特定一筆「飲食 YOLO 辨識草稿」的詳細內容時，請呼叫此工具。此工具會連線至資料庫，回傳該草稿的辨識結果 (detected_items) 與圖片路徑 (image_path)。
注意：呼叫此工具時，必須將草稿單號 (draft_id) 作為「query」參數傳入。
*/


const draft_id = $fromAI().query;
const userToken = $node["When chat message received"].json.headers.authorization;

const SUPABASE_URL = $env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = $env.get('SUPABASE_ANON_KEY');

try {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/diet_drafts?id=eq.${draft_id}&select=*`, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': userToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase 請求失敗: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    return JSON.stringify({ message: "找不到該單號紀錄，或您無權限查看。" });
  }

  return JSON.stringify({
    id: data[0].id,
    detected_items: data[0].detected_items,
    image_path: data[0].image_path
  });

} catch (err) {
  return JSON.stringify({ error: err.message });
}
