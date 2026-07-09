'use client';

import { useEffect, useState } from 'react';

// URL を開く（ロード / リロード）たびに毎回挟むイントロ。
const HOLD_MS = 1000; // 出しきってから退場を始めるまで（＝しっかり読める時間 ＝ 1秒）
const EXIT_MS = 380; // 退場アニメーションの尺

export default function IntroSplash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // ページを開くたびに再生する（間隔判定なし）。
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), HOLD_MS);
    const t2 = setTimeout(() => setShow(false), HOLD_MS + EXIT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  return (
    <div className={`ccd-intro${leaving ? ' is-leaving' : ''}`} aria-hidden="true">
      <div className="ccd-intro__inner">
        <span className="ccd-intro__mark" />
        <div className="ccd-intro__title">
          <span className="ccd-intro__l1">Claude Code</span>
          <span className="ccd-intro__l2">DASHBOARD</span>
        </div>
        <span className="ccd-intro__bar" />
      </div>
    </div>
  );
}
