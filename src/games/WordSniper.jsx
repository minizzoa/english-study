import { useState, useRef, useCallback, useEffect } from 'react';
import { WORDS, pickSniperBubbles } from '../data/wordData';
import {
  playCorrect, playCombo, playWrong,
  playGameOver, playLevelUp, isMuted, toggleMute,
} from '../utils/sound';
import './WordSniper.css';

const TOTAL_LIVES   = 5;
const GAME_DURATION = 90;
const BUBBLE_COUNT  = 8;

// 버블 초기 위치/속도 생성
function makeBubble(word, id) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.6 + Math.random() * 0.8;
  const height = 52;
  const width  = Math.max(84, word.en.length * 11 + 28); // 글자 수에 따라 가로 길이
  return {
    id,
    word,
    x: 15 + Math.random() * 70,
    y: 15 + Math.random() * 70,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    width,   // 가로 (글자 수 기반)
    height,  // 세로 (고정)
  };
}

function buildBubbles(correctWord) {
  const words = pickSniperBubbles(correctWord, WORDS, BUBBLE_COUNT);
  return words.map((w, i) => makeBubble(w, i));
}

export default function WordSniper({ onBack }) {
  const [phase,   setPhase]   = useState('splash');
  const [muted,   setMuted]   = useState(isMuted());
  const [target,  setTarget]  = useState(null);   // current WORDS item
  const [bubbles, setBubbles] = useState([]);
  const [lives,   setLives]   = useState(TOTAL_LIVES);
  const [score,   setScore]   = useState(0);
  const [streak,  setStreak]  = useState(0);
  const [timeLeft,setTimeLeft]= useState(GAME_DURATION);
  const [toast,   setToast]   = useState(null);
  const [popId,   setPopId]   = useState(null);   // 정답 버블 팝 애니메이션
  const [shakeId, setShakeId] = useState(null);   // 오답 버블 흔들기

  const strRef    = useRef(0);
  const scoreRef  = useRef(0);
  const livesRef  = useRef(TOTAL_LIVES);
  const activeRef = useRef(false);

  const bubblesRef = useRef([]);
  bubblesRef.current = bubbles;

  const rafRef   = useRef(null);
  const areaRef  = useRef(null);  // fall-area DOM ref

  /* ─── rAF 이동 루프 ─────────────────────── */
  useEffect(() => {
    if (phase !== 'playing') return;

    let lastTime = performance.now();

    function loop(now) {
      if (!activeRef.current) return;
      const dt = Math.min(now - lastTime, 50); // ms, 최대 50ms
      lastTime = now;

      const areaW = areaRef.current?.clientWidth  || 300;
      const areaH = areaRef.current?.clientHeight || 300;

      setBubbles(prev => prev.map(b => {
        let px = (b.x / 100) * areaW;
        let py = (b.y / 100) * areaH;
        const hw = b.width  / 2;  // 가로 반경
        const hh = b.height / 2;  // 세로 반경

        px += b.vx * dt * 0.07;
        py += b.vy * dt * 0.07;

        let vx = b.vx, vy = b.vy;
        if (px - hw < 0)       { px = hw;          vx = Math.abs(vx);  }
        if (px + hw > areaW)   { px = areaW - hw;  vx = -Math.abs(vx); }
        if (py - hh < 0)       { py = hh;           vy = Math.abs(vy);  }
        if (py + hh > areaH)   { py = areaH - hh;  vy = -Math.abs(vy); }

        return { ...b, x: (px / areaW) * 100, y: (py / areaH) * 100, vx, vy };
      }));

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  /* ─── 타이머 ─────────────────────────────── */
  useEffect(() => {
    if (phase !== 'playing') return;
    const t = setInterval(() => {
      setTimeLeft(s => {
        if (s <= 1) {
          clearInterval(t);
          activeRef.current = false;
          playGameOver();
          setPhase('over');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  /* ─── 새 라운드 (타겟 변경) ─────────────── */
  const nextRound = useCallback((pool = WORDS) => {
    const w = pool[Math.floor(Math.random() * pool.length)];
    setTarget(w);
    setBubbles(buildBubbles(w));
    setPopId(null);
    setShakeId(null);
  }, []);

  /* ─── 버블 클릭 ──────────────────────────── */
  const handleBubble = useCallback((bubble) => {
    if (!activeRef.current) return;

    if (bubble.word.en === target?.en) {
      // 정답
      setPopId(bubble.id);
      const str = strRef.current + 1;
      strRef.current = str; setStreak(str);

      const pts      = 10 + (str >= 3 ? Math.floor(str / 3) * 5 : 0);
      const newScore = scoreRef.current + pts;
      const oldLevel = Math.floor(scoreRef.current / 100) + 1;
      const newLevel = Math.floor(newScore / 100) + 1;
      scoreRef.current = newScore; setScore(newScore);

      if (newLevel > oldLevel) playLevelUp();
      else if (str >= 3)       playCombo();
      else                     playCorrect();

      setToast({ text: `+${pts}${str >= 3 ? ` 🔥×${str}` : ''}`, type: 'correct', key: Date.now() });
      setTimeout(() => nextRound(), 500);

    } else {
      // 오답
      setShakeId(bubble.id);
      playWrong();
      strRef.current = 0; setStreak(0);
      const newLives = livesRef.current - 1;
      livesRef.current = newLives; setLives(newLives);
      setToast({ text: `❌ "${bubble.word.en}" 틀렸어요`, type: 'wrong', key: Date.now() });
      setTimeout(() => setShakeId(null), 400);

      if (newLives <= 0) {
        activeRef.current = false;
        setTimeout(() => { playGameOver(); setPhase('over'); }, 500);
      }
    }
  }, [target, nextRound]);

  /* ─── 시작 / 재시작 ─────────────────────── */
  const startGame = () => {
    scoreRef.current = 0;           setScore(0);
    strRef.current   = 0;           setStreak(0);
    livesRef.current = TOTAL_LIVES; setLives(TOTAL_LIVES);
    setTimeLeft(GAME_DURATION);
    setToast(null);
    activeRef.current = true;
    setPhase('playing');
    const w = WORDS[Math.floor(Math.random() * WORDS.length)];
    setTarget(w);
    setBubbles(buildBubbles(w));
  };

  const level = Math.floor(score / 100) + 1;

  /* 타이머 색 */
  const timerDanger = timeLeft <= 15;
  const timerPct    = (timeLeft / GAME_DURATION) * 100;

  /* ─── 스플래시 ───────────────────────────── */
  if (phase === 'splash') return (
    <div className="ws-splash">
      <div className="ws-card">
        <div className="ws-splash-icon">🎯</div>
        <h1>단어 스나이퍼</h1>
        <p>한글 단어를 보고 떠다니는<br />버블에서 영어 단어를 찾아 터뜨려요!</p>
        <ul className="ws-rules">
          <li>🎯 한글 단어 뜻을 확인하세요</li>
          <li>💥 화면에서 영어 단어 버블을 탭!</li>
          <li>❤️ 오답 클릭시 생명 감소 (5개)</li>
          <li>⏱ 90초 안에 최대한 많이!</li>
          <li>🔥 연속 정답으로 콤보 보너스!</li>
        </ul>
        <button className="ws-btn-primary" onClick={startGame}>시작하기</button>
        <button className="ws-btn-back" onClick={onBack}>← 뒤로</button>
      </div>
    </div>
  );

  /* ─── 게임 오버 ─────────────────────────── */
  if (phase === 'over') {
    const rank = score >= 300 ? '🏆 영어 마스터'
               : score >= 150 ? '🥇 영어 고수'
               : score >= 60  ? '🥈 영어 학생'
               :                '🥉 초보 탐험가';
    return (
      <div className="ws-splash">
        <div className="ws-card">
          <div className="ws-splash-icon">🎉</div>
          <h1>게임 종료!</h1>
          <div className="ws-rank">{rank}</div>
          <div className="ws-stats">
            <div className="ws-stat"><span>최종 점수</span><strong>{score}점</strong></div>
            <div className="ws-stat"><span>도달 레벨</span><strong>Lv.{level}</strong></div>
          </div>
          <button className="ws-btn-primary" onClick={startGame}>다시 하기</button>
          <button className="ws-btn-back" onClick={() => setPhase('splash')}>← 뒤로</button>
        </div>
      </div>
    );
  }

  /* ─── 플레이 화면 ───────────────────────── */
  return (
    <div className="ws-game">

      {/* HUD */}
      <div className="ws-hud">
        <div className="ws-hud-score">
          <span className="ws-hud-val">{score}</span>
          <span className="ws-hud-lbl">점수</span>
        </div>
        <div className="ws-hud-mid">
          <span className="ws-badge-lv">Lv.{level}</span>
          {streak >= 3 && <span className="ws-badge-streak">🔥×{streak}</span>}
        </div>
        <div className="ws-hud-right">
          <div className="ws-hud-lives">
            {'❤️'.repeat(lives)}{'🖤'.repeat(Math.max(0, TOTAL_LIVES - lives))}
          </div>
          <div className="ws-hud-btns">
            <button className="ws-mute-btn" onClick={onBack} aria-label="홈으로">🏠</button>
            <button
              className="ws-mute-btn"
              onClick={() => setMuted(toggleMute())}
              aria-label={muted ? '소리 켜기' : '소리 끄기'}
            >{muted ? '🔇' : '🔊'}</button>
          </div>
        </div>
      </div>

      {/* 타이머 + 타겟 */}
      <div className="ws-target-wrap">
        <div className="ws-timer-ring-wrap">
          <div className={`ws-timer-val${timerDanger ? ' ws-timer-danger' : ''}`}>{timeLeft}</div>
        </div>
        <div className="ws-target-card">
          <span className="ws-target-lbl">찾아보세요</span>
          <span className="ws-target-ko">{target?.ko}</span>
        </div>
      </div>

      {/* 타이머 바 */}
      <div className="ws-timer-wrap">
        <div
          className={`ws-timer-bar${timerDanger ? ' ws-timer-danger' : ''}`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {/* 버블 영역 */}
      <div className="ws-area" ref={areaRef}>
        {bubbles.map(b => (
          <button
            key={b.id}
            className={`ws-bubble
              ${b.id === popId   ? ' ws-bubble-pop'   : ''}
              ${b.id === shakeId ? ' ws-bubble-shake' : ''}
            `}
            style={{
              left:   `${b.x}%`,
              top:    `${b.y}%`,
              width:  `${b.width}px`,
              height: `${b.height}px`,
              '--bcolor': `hsl(${(b.id * 47) % 360},70%,88%)`,
            }}
            onClick={() => handleBubble(b)}
          >
            <span className="ws-bubble-en">{b.word.en}</span>
          </button>
        ))}
      </div>

      {/* 토스트 */}
      <div className="ws-toast-row">
        {toast && (
          <span key={toast.key} className={`ws-toast ws-toast-${toast.type}`}>
            {toast.text}
          </span>
        )}
      </div>
    </div>
  );
}
