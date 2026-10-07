'use client';

import React from 'react';
import type { QuestionMapEntry, PersonalizedQuestion } from './questionMap';

interface QuestionMapViewProps {
  questions: QuestionMapEntry[];
  onQuestionUpdate: (questionId: string, text: string) => void;
}

/**
 * Story 質問マップビュー
 * 
 * PC（≥760px）: 2列レイアウト（左：質問、右：個別化）
 * SP（<760px）: 1列レイアウト（質問 → 操作 → 個別化 → データヒント → コーチ確認）
 */
export const QuestionMapView: React.FC<QuestionMapViewProps> = ({
  questions,
  onQuestionUpdate,
}) => {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [windowWidth, setWindowWidth] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isPc = windowWidth >= 760;

  if (isPc) {
    // 2列レイアウト
    return (
      <div className="grid grid-cols-2 gap-4 p-4">
        {/* 左：質問 */}
        <div className="space-y-4">
          <h3 className="font-semibold">質問を組み立てる</h3>
          {questions.map(q => (
            <div key={q.question} className="border p-4 rounded">
              {editingId === q.question ? (
                <textarea
                  value={q.question}
                  onChange={(e) => onQuestionUpdate(q.question, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  className="w-full border p-2 rounded"
                />
              ) : (
                <p onClick={() => setEditingId(q.question)} className="cursor-pointer hover:bg-gray-100 p-2">
                  {q.question}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* 右：個別化 */}
        <div className="space-y-4">
          <h3 className="font-semibold">相談を加味した提案</h3>
          {questions.map(q => (
            <div key={`${q.question}-personalization`} className="border p-4 rounded bg-blue-50">
              <p className="text-sm text-gray-600">{q.route_role} 向け</p>
              {q.personalization.length > 0 ? (
                q.personalization.map(p => (
                  <div key={p.questionId} className="mt-2">
                    <p className="font-sm">{p.text}</p>
                    {p.hints.length > 0 && (
                      <ul className="text-xs text-gray-500 mt-1">
                        {p.hints.map((hint, i) => <li key={i}>• {hint}</li>)}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">個別化なし</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // SP: 1列レイアウト
  return (
    <div className="space-y-4 p-4">
      {questions.map(q => (
        <div key={q.question} className="border rounded">
          {/* 質問 */}
          <div className="p-3 border-b">
            {editingId === q.question ? (
              <textarea
                value={q.question}
                onChange={(e) => onQuestionUpdate(q.question, e.target.value)}
                onBlur={() => setEditingId(null)}
                className="w-full border p-2 rounded"
              />
            ) : (
              <p onClick={() => setEditingId(q.question)} className="cursor-pointer">
                {q.question}
              </p>
            )}
          </div>

          {/* 操作 */}
          <div className="p-2 flex gap-2 border-b">
            <button className="text-xs px-2 py-1 border rounded">PERSONALIZE</button>
            <button className="text-xs px-2 py-1 border rounded">CLARIFY</button>
            <button className="text-xs px-2 py-1 border rounded">DISMISS</button>
          </div>

          {/* 個別化 */}
          <div className="p-3 border-b bg-blue-50">
            <p className="text-xs font-semibold text-gray-600">{q.route_role} 向け提案</p>
            {q.personalization.length > 0 ? (
              q.personalization.map(p => (
                <div key={p.questionId} className="mt-2 text-sm">
                  <p>{p.text}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400">個別化なし</p>
            )}
          </div>

          {/* データヒント */}
          <div className="p-3 border-b text-xs">
            <p className="text-gray-600">必要なデータ：...</p>
          </div>

          {/* コーチ確認 */}
          <div className="p-2">
            <input type="checkbox" id={`coach-${q.question}`} />
            <label htmlFor={`coach-${q.question}`} className="text-xs ml-1">この質問でいいですか？</label>
          </div>
        </div>
      ))}
    </div>
  );
};
