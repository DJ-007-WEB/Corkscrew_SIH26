import { useEffect, useState } from "react";
import type { ModuleQuestion } from "./moduleData";

type Props = {
  quizId: string;
  title: string;
  questions: ModuleQuestion[];
  locked: boolean;
  completed: boolean;
  onComplete: (quizId: string) => void;
};

export default function LessonQuiz({ quizId, title, questions, locked, completed, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showReview, setShowReview] = useState(false);
  const [retaking, setRetaking] = useState(false);

  useEffect(() => {
    setIndex(0);
    setAnswers({});
    setShowReview(false);
    setRetaking(false);
  }, [quizId]);

  if (locked) return <section className="mt-10 rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4"><p className="text-xs font-mono text-[var(--bp-text-faint)]">🔒 Complete every previous quiz to unlock this one.</p></section>;
  if (!questions.length) return null;

  const question = questions[index];
  const selected = answers[index];
  const last = index === questions.length - 1;
  const score = questions.filter((item, itemIndex) => answers[itemIndex] === item.answer).length;
  const quizActive = !completed || retaking;

  function next() {
    if (selected === undefined) return;
    if (last) {
      setShowReview(true);
      onComplete(quizId);
      return;
    }
    setIndex((current) => current + 1);
  }

  function startRetake() {
    setIndex(0);
    setAnswers({});
    setShowReview(false);
    setRetaking(true);
  }

  return (
    <section className="mt-10 rounded border border-[var(--bp-cyan)]/45 bg-[var(--bp-panel-raised)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div><p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Knowledge check · {questions.length} questions</p><h3 className="font-display text-lg mt-1">{title}</h3></div>
        {!showReview && quizActive && <button onClick={next} disabled={selected === undefined} title={last ? "Finish quiz" : "Next question"} className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--bp-cyan)] text-lg text-[var(--bp-cyan)] disabled:cursor-not-allowed disabled:opacity-35">{last ? "✓" : "›"}</button>}
      </div>
      {showReview ? <div className="mt-4 space-y-4">
        <div className="rounded border border-[var(--bp-mint)]/40 bg-[var(--bp-mint)]/10 p-3 text-sm text-[var(--bp-mint)]">✓ Quiz completed · Score: {score}/{questions.length}</div>
        {questions.map((reviewQuestion, questionIndex) => <div key={reviewQuestion.question} className="rounded border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3">
          <p className="text-[10px] font-mono text-[var(--bp-text-faint)]">Question {questionIndex + 1}</p>
          <p className="mt-1 text-sm font-medium leading-relaxed">{reviewQuestion.question}</p>
          <div className="mt-3 space-y-2">{reviewQuestion.options.map((option, optionIndex) => {
            const isCorrect = optionIndex === reviewQuestion.answer;
            const isSelected = answers[questionIndex] === optionIndex;
            const style = isCorrect ? "border-[var(--bp-mint)]/60 bg-[var(--bp-mint)]/10 text-[var(--bp-mint)]" : isSelected ? "border-red-400/70 bg-red-400/10 text-red-300" : "border-[var(--bp-border)] text-[var(--bp-text-dim)]";
            return <div key={option} className={`rounded border px-3 py-2 text-sm ${style}`}>{option}{isCorrect && <span className="ml-2 text-xs">✓ Correct answer</span>}{isSelected && !isCorrect && <span className="ml-2 text-xs">Your answer</span>}</div>;
          })}</div>
        </div>)}
      </div> : completed && !retaking ? <div className="mt-4 rounded border border-[var(--bp-mint)]/40 bg-[var(--bp-mint)]/10 p-3 text-sm text-[var(--bp-mint)]"><p>✓ Quiz completed. Your next quiz is unlocked.</p><button onClick={startRetake} className="mt-2 text-xs underline underline-offset-2">Take this quiz again</button></div> : <><p className="mt-4 text-[10px] font-mono text-[var(--bp-text-faint)]">Question {index + 1} of {questions.length}</p><p className="mt-1 text-sm font-medium leading-relaxed">{question.question}</p><div className="mt-4 space-y-2">{question.options.map((option, optionIndex) => <label key={option} className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${selected === optionIndex ? "border-[var(--bp-cyan)] bg-[var(--bp-cyan-dim)] text-[var(--bp-text)]" : "border-[var(--bp-border)] text-[var(--bp-text-dim)]"}`}><input type="radio" name={`${quizId}-${index}`} checked={selected === optionIndex} onChange={() => setAnswers({ ...answers, [index]: optionIndex })} />{option}</label>)}</div><p className="mt-3 text-[11px] text-[var(--bp-text-faint)]">Select an answer, then use the arrow at the top-right to continue.</p></>}
    </section>
  );
}
