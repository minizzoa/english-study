import { useState, useEffect, useRef, useCallback } from 'react';
import { SENTENCES, WORDS, pickFillChoices } from '../data/wordData';
import {
  playCorrect, playCombo, playWrong, playTimeout,
  playGameOver, playLevelUp, isMuted, toggleMute,
} from '../utils/sound';
import './FillBlank.css';

const TIME_PER_Q  = 15;   // 문제당 제한 시간(초)
const TOTAL_LIVES = 5;

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

export default function FillBlank({ onBack }) {
  const [phase,        setPhase]        = useState('splash');
  const [muted,        setMuted]        = useState(isMuted());
  const [queue,        setQueue]        = useState([]);
  const [qIdx,         setQIdx]         = useState(0);
  const [choices,      setChoices]      = useState([]);
  const [choiceStatus, setChoiceStatus] = useState(null); // { type:'correct'|'wrong', idx }
  const [timeLeft,     setTimeLeft]     = useState(TIME_PER_Q);
  const [score,        setScore]        = useState(0);
  const [lives,        setLives]        = useState(TOTAL_LIVES);
  const [streak,       setStreak]       = useState(0);
  const [toast,        setToast]        = useState(null);
  const [correct,      setCorrect]      = useState(0);
  const [total,        setTotal]        = useState(0);

  const strRef    = useRef(0);
  const scoreRef  = useRef(0);
  const livesRef  = useRef(TOTAL_LIVES);
  const activeRef = useRef(false);
  const timerRef  = useRef(null);
  const queueRef  = useRef([]);  // 동기적으로 queue를 참조하기 위한 ref

  const currentQ = queue[qIdx] ?? null;

  /* ─── 문제 로드 ──────────────────────────── */
  useEffect(() => {
    if (!currentQ || phase !== 'playing') return;
    const correctWord = WORDS.find(w => w.en === currentQ.blank) ?? { en: currentQ.blank, ko: currentQ.hint };
    setChoices(pickFillChoices(correctWord, WORDS));
    setChoiceStatus(null);
    setTimeLeft(TIME_PER_Q);
  }, [qIdx, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── 타이머 ──────────────────────────────── */
  useEffect(() => {
    if (phase !== 'playing' || choiceStatus) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [qIdx, phase, choiceStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── 타임아웃 처리 ─────────────────────── */
  const handleTimeout = useCallback(() => {
    if (!activeRef.current) return;
    playTimeout();
    strRef.current = 0; setStreak(0);
    const newLives = livesRef.current - 1;
    livesRef.current = newLives; setLives(newLives);
    setToast({ text: `⏱ ${currentQ?.blank ?? ''}`, type: 'timeout', key: Date.now() });

    if (newLives <= 0) {
      activeRef.current = false;
      setTimeout(() => { playGameOver(); setPhase('over'); }, 600);
    } else {
      setTimeout(() => advanceQ(), 900);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQ]);

  /* ─── 보기 클릭 ──────────────────────────── */
  const handleChoice = useCallback((choiceWord, idx) => {
    if (!activeRef.current || choiceStatus) return;
    clearInterval(timerRef.current);

    if (choiceWord.en === currentQ.blank) {
      // 정답
      const str = strRef.current + 1;
      strRef.current = str; setStreak(str);

      const lvl  = Math.floor(scoreRef.current / 100) + 1;
      const pts  = 10 + (str >= 3 ? Math.floor(str / 3) * 5 : 0) + Math.floor(timeLeft * 0.5);
      const newScore = scoreRef.current + pts;
      const oldLevel = lvl;
      const newLevel = Math.floor(newScore / 100) + 1;
      scoreRef.current = newScore; setScore(newScore);
      setCorrect(c => c + 1);

      if (newLevel > oldLevel) playLevelUp();
      else if (str >= 3)       playCombo();
      else                     playCorrect();

      setChoiceStatus({ type: 'correct', idx });
      setToast({ text: `+${pts}${str >= 3 ? ` 🔥×${str}` : ''}`, type: 'correct', key: Date.now() });
      setTimeout(() => advanceQ(), 800);

    } else {
      // 오답
      playWrong();
      strRef.current = 0; setStreak(0);
      const newLives = livesRef.current - 1;
      livesRef.current = newLives; setLives(newLives);
      setChoiceStatus({ type: 'wrong', idx });
      setToast({ text: `정답: ${currentQ.blank}`, type: 'wrong', key: Date.now() });

      if (newLives <= 0) {
        activeRef.current = false;
        setTimeout(() => { playGameOver(); setPhase('over'); }, 800);
      } else {
        setTimeout(() => advanceQ(), 1000);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQ, choiceStatus, timeLeft]);

  /* ─── 다음 문제 (무한 순환) ──────────────── */
  const advanceQ = useCallback(() => {
    setTotal(t => t + 1);
    setQIdx(i => {
      const next = i + 1;
      if (next >= queueRef.current.length) {
        // 전체 문장 소진 → 재셔플 후 처음부터
        const newQueue = shuffle(SENTENCES);
        queueRef.current = newQueue;
        setQueue(newQueue);
        return 0;
      }
      return next;
    });
  }, []);

  /* ─── 시작 / 재시작 ─────────────────────── */
  const startGame = () => {
    scoreRef.current = 0;           setScore(0);
    strRef.current   = 0;           setStreak(0);
    livesRef.current = TOTAL_LIVES; setLives(TOTAL_LIVES);
    setCorrect(0);
    setTotal(0);
    setToast(null);
    setChoiceStatus(null);
    const q = shuffle(SENTENCES);
    queueRef.current = q;
    setQueue(q);
    setQIdx(0);
    activeRef.current = true;
    setPhase('playing');
  };

  const level = Math.floor(score / 100) + 1;

  /* ─── 문장 빈칸 렌더 ─────────────────────── */
  function renderSentence(sentence) {
    const parts = sentence.split('___');
    return (
      <span>
        {parts[0]}
        <span className="fb-blank-slot">___</span>
        {parts[1] ?? ''}
      </span>
    );
  }

  /* ─── 스플래시 ────────────────────────── */
  if (phase === 'splash') return (
    <div className="fb-splash">
      <div className="fb-card">
        <div className="fb-splash-icon">✏️</div>
        <h1>빈칸 채우기</h1>
        <p>영어 문장의 빈칸에 들어갈<br />단어를 보기에서 골라보세요!</p>
        <ul className="fb-rules">
          <li>📖 문장을 읽고 빈칸 단어를 선택</li>
          <li>💡 한글 힌트를 참고하세요</li>
          <li>⏱ 문제당 {TIME_PER_Q}초 안에 답하기</li>
          <li>❤️ 오답/타임아웃시 생명 감소 (5개)</li>
          <li>🔥 연속 정답으로 콤보 보너스!</li>
        </ul>
        <button className="fb-btn-primary" onClick={startGame}>시작하기</button>
        <button className="fb-btn-back" onClick={onBack}>← 뒤로</button>
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
      <div className="fb-splash">
        <div className="fb-card">
          <div className="fb-splash-icon">🎉</div>
          <h1>게임 오버!</h1>
          <div className="fb-rank">{rank}</div>
          <div className="fb-stats">
            <div className="fb-stat"><span>최종 점수</span><strong>{score}점</strong></div>
            <div className="fb-stat"><span>정답 수</span><strong>{correct}개</strong></div>
          </div>
          <button className="fb-btn-primary" onClick={startGame}>다시 하기</button>
          <button className="fb-btn-back" onClick={onBack}>← 메뉴</button>
        </div>
      </div>
    );
  }

  /* ─── 플레이 화면 ───────────────────────── */
  const timerPct    = (timeLeft / TIME_PER_Q) * 100;
  const timerDanger = timeLeft <= 5;

  return (
    <div className="fb-game">

      {/* HUD */}
      <div className="fb-hud">
        <div className="fb-hud-score">
          <span className="fb-hud-val">{score}</span>
          <span className="fb-hud-lbl">점수</span>
        </div>
        <div className="fb-hud-mid">
          <span className="fb-badge-lv">Lv.{level}</span>
          {streak >= 3 && <span className="fb-badge-streak">🔥×{streak}</span>}
        </div>
        <div className="fb-hud-right">
          <div className="fb-hud-lives">
            {'❤️'.repeat(lives)}{'🖤'.repeat(Math.max(0, TOTAL_LIVES - lives))}
          </div>
          <div className="fb-hud-btns">
            <button className="fb-mute-btn" onClick={onBack} aria-label="홈으로">🏠</button>
            <button
              className="fb-mute-btn"
              onClick={() => setMuted(toggleMute())}
              aria-label={muted ? '소리 켜기' : '소리 끄기'}
            >{muted ? '🔇' : '🔊'}</button>
          </div>
        </div>
      </div>

      {/* 진행 카운터 */}
      <div className="fb-progress">
        <span className="fb-q-counter">문제 {total + 1}</span>
        <span className="fb-q-correct">✅ {correct}개 정답</span>
      </div>

      {/* 타이머 바 */}
      <div className="fb-timer-wrap">
        <div
          className={`fb-timer-bar${timerDanger ? ' fb-timer-danger' : ''}`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {/* 문제 카드 */}
      {currentQ && (
        <div className="fb-question-area">
          {timeLeft <= 5
            ? <div className="fb-hint-badge">💡 {currentQ.hint}</div>
            : <div className="fb-hint-badge fb-hint-hidden">💡 ?</div>
          }
          <div className="fb-sentence">
            {renderSentence(currentQ.sentence)}
          </div>
        </div>
      )}

      {/* 토스트 */}
      <div className="fb-toast-row">
        {toast && (
          <span key={toast.key} className={`fb-toast fb-toast-${toast.type}`}>
            {toast.text}
          </span>
        )}
      </div>

      {/* 보기 4개 */}
      <div className="fb-choices">
        {choices.map((c, i) => {
          const st = choiceStatus?.idx === i ? choiceStatus.type : null;
          return (
            <button
              key={c.en}
              className={`fb-choice-btn${st ? ` fb-choice-${st}` : ''}`}
              onClick={() => handleChoice(c, i)}
              disabled={!!choiceStatus}
            >
              <span className="fb-choice-en">{c.en}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
