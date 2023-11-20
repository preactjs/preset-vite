// @ts-ignore
import React, { useMemo, useState } from "react";

export function ReactComponent() {
	const [v, set] = useState(0);

	// NOTE: To check in devtools that babel-plugin-transform-hook-names can
	// extract the variable names from typed expressions.
	const _unusedState = useState(0 as any);
	const _unusedMemo: number = useMemo<number>(
		() => _unusedState[0],
		[_unusedState[0]],
	);

	return (
		<div>
			<p>Counter: {v}</p>
			<button onClick={() => set(v + 1)}>update</button>
		</div>
	);
}
