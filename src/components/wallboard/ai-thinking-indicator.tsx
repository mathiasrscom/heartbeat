import { useEffect, useState } from "react";

const THINKING_PHRASES = [
	"Analyzing queue health",
	"Reviewing SLA adherence",
	"Checking case priorities",
	"Scanning for breaches",
	"Evaluating response times",
	"Reading the queue",
	"Assessing team workload",
	"Reviewing open cases",
	"Checking assignment coverage",
	"Inspecting due dates",
	"Mapping case urgency",
	"Weighing queue pressure",
	"Reviewing case backlog",
	"Checking customer wait times",
	"Analyzing support patterns",
	"Evaluating queue balance",
	"Spotting bottlenecks",
	"Reviewing ticket flow",
	"Assessing SLA risk",
	"Looking at the big picture",
];

function getRandomPhrase(previous?: string) {
	let next = previous;
	while (next === previous) {
		next =
			THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
	}
	return next!;
}

let stepCounter = 0;

export function AiThinkingIndicator() {
	const [phrase, setPhrase] = useState(() => getRandomPhrase());
	const [history, setHistory] = useState<{ id: number; text: string }[]>([]);
	const [dotCount, setDotCount] = useState(1);

	useEffect(() => {
		const interval = setInterval(() => {
			setPhrase((prev) => {
				const next = getRandomPhrase(prev);
				const id = ++stepCounter;
				setHistory((h) => [{ id, text: prev }, ...h].slice(0, 3));
				return next;
			});
		}, 3_500);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		const interval = setInterval(() => {
			setDotCount((prev) => (prev % 3) + 1);
		}, 500);
		return () => clearInterval(interval);
	}, []);

	const dots = ".".repeat(dotCount);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2 text-sm">
				<span
					className="inline-block shrink-0 text-purple-500 animate-spin dark:text-purple-400"
					style={{ animationDuration: "3s" }}
				>
					&#10022;
				</span>
				<span className="font-medium text-foreground">
					{phrase}
					{dots}
				</span>
			</div>
			{history.length > 0 && (
				<div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-5 text-[11px] text-muted-foreground/60">
					{history.map((h) => (
						<span key={h.id} className="animate-in fade-in duration-500">
							{h.text} &#10003;
						</span>
					))}
				</div>
			)}
		</div>
	);
}
