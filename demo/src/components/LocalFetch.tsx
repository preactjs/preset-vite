import { useState } from "preact/hooks";

const cache = new Map();

async function load(url: string) {
	const res = await fetch(url);
	if (res.ok) return await res.text();
	throw new Error(`Failed to fetch ${url}!`);
}

function useFetch(url: string) {
	const [_, update] = useState({});

	let data = cache.get(url);
	if (!data) {
		data = load(url);
		cache.set(url, data);
		data.then(
			(res: string) => update((data.res = res)),
			(err: Error) => update((data.err = err)),
		);
	}

	if (data.res) return data.res;
	if (data.err) throw data.err;
	throw data;
}

export function LocalFetch() {
	const data = useFetch("/local-fetch-test.txt");

	return <p>{data.trimEnd()}</p>;
}
