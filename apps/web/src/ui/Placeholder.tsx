/** 未実装画面の仮置き。各画面の担当が置き換える。 */
export function Placeholder({ title, design }: { title: string; design: string }) {
  return (
    <div className="p-8">
      <div className="tile p-8">
        <h1 className="n m-0 text-[28px]">{title}</h1>
        <p className="mt-3 text-sub">
          未実装 — 設計稿 <code className="text-text">design/{design}</code>
        </p>
      </div>
    </div>
  );
}
