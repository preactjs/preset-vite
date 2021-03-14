import { VNode } from "preact";

type StreamedProps = Record<string, any> & {
	children?: StreamedChild | StreamedChild[];
};
type StreamedChild =
	| string
	| number
	| null
	| ["$", string, null | string | number, StreamedProps];

type StreamedVNode = StreamedChild | StreamedChild[];

export function renderToServerProtocol(vnode: VNode): StreamedVNode {
	return renderToServer(vnode, {});
}

function renderToServer(
	vnode: VNode,
	context: Record<string, any>,
): StreamedChild {
	// Invalid vnodes should be ignored.
	if (vnode == null || typeof vnode === "boolean") {
		return null;
	}
	// Anything else will be cast to a string
	else if (typeof vnode !== "object") {
		return String(vnode);
	}
	// Components can return arrays too. On the client those
	// will be wrapped with a Fragment component
	else if (Array.isArray(vnode)) {
		return vnode.map(item => renderToServer(item, context)) as any;
	}

	const type = vnode.type;
	const key = vnode.key;
	const props = vnode.props as Record<string, any>;

	// Text vnodes
	if (type === null) {
		return props as any;
	}
	// Components
	else if (typeof type === "function") {
		// TODO: Should we allow class components?
		const rendered = (type as any)(props);
		return renderToServer(rendered, context);
	}

	// From here on we're only dealing with DOM nodes
	const outKey =
		typeof key === "string" || typeof key === "number" ? key : null;

	const outProps: Record<string, any> = {};
	const out: StreamedChild = ["$", type, outKey, outProps];

	let names = Object.keys(props);

	let propChildren = null;
	let selectValue = null;

	// TODO: How much do we want to normalize based on HTML
	// here? Or should we just send the props we got and
	// let the client deal with all normalization concerns?
	for (let i = 0; i < names.length; i++) {
		let name = names[i];
		let value = props[name];

		if (name === "children") {
			propChildren = value;
			continue;
		} else if (
			name === "key" ||
			name === "ref" ||
			name === "__self" ||
			name === "__source" ||
			name === "defaultValue" ||
			// TODO: Not sure if we should ignore this or not
			name === "dangerouslySetInnerHTML" ||
			// Ignore any events
			typeof value === "function"
		) {
			continue;
		} else if (name === "htmlFor") {
			if (props.for) continue;
			name = "for";
			outProps[name] = value;
		} else if (name === "style" && value && typeof value === "object") {
			// FIXME
			value = "FIXME";
		}
		// always use string values instead of booleans for
		// aria attributes also see
		// https://github.com/preactjs/preact/pull/2347/files
		else if (name[0] === "a" && name[1] === "r" && typeof value === "boolean") {
			outProps[name] = String(value);
		}
		// Render textarea value as children:
		// <textarea value="a&b"> -> <textarea>a&b</textarea>
		else if (type === "textarea" && name === "value") {
			propChildren = value;
			continue;
		}
		// Various input value handling
		else if (
			(value || value === 0 || value === "") &&
			typeof value !== "function"
		) {
			if (value !== true && value !== "" && name === "value") {
				// The select value will be passed to the
				// `<option>` element
				if (type === "select") {
					selectValue = value;
					continue;
				} else if (type === "option" && selectValue === value) {
					name = "selected";
					value = true;
				}
			}

			outProps[name] = value;
		}
	}

	// Make sure that we render children _after_ all props
	// have been processed.
	if (propChildren) {
		outProps.children = renderToServer(propChildren, context);
	}

	return out;
}
