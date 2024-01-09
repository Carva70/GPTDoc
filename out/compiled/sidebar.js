var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        if (value == null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
     * Event dispatchers are functions that can take two arguments: `name` and `detail`.
     *
     * Component events created with `createEventDispatcher` create a
     * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
     * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
     * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
     * property and can contain any type of data.
     *
     * https://svelte.dev/docs#run-time-svelte-createeventdispatcher
     */
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail, { cancelable = false } = {}) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail, { cancelable });
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
                return !event.defaultPrevented;
            }
            return true;
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* webviews\components\Nav.svelte generated by Svelte v3.59.2 */
    const file$6 = "webviews\\components\\Nav.svelte";

    function create_fragment$7(ctx) {
    	let nav;
    	let ul;
    	let li0;
    	let button0;
    	let t1;
    	let li1;
    	let button1;
    	let t3;
    	let li2;
    	let button2;
    	let t5;
    	let li3;
    	let button3;
    	let t7;
    	let li4;
    	let button4;
    	let t9;
    	let li5;
    	let button5;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			nav = element("nav");
    			ul = element("ul");
    			li0 = element("li");
    			button0 = element("button");
    			button0.textContent = "Comment";
    			t1 = space();
    			li1 = element("li");
    			button1 = element("button");
    			button1.textContent = "Debug";
    			t3 = space();
    			li2 = element("li");
    			button2 = element("button");
    			button2.textContent = "Test";
    			t5 = space();
    			li3 = element("li");
    			button3 = element("button");
    			button3.textContent = "Optimize";
    			t7 = space();
    			li4 = element("li");
    			button4 = element("button");
    			button4.textContent = "Rewrite";
    			t9 = space();
    			li5 = element("li");
    			button5 = element("button");
    			button5.textContent = "Clean";
    			attr_dev(button0, "class", "svelte-1862z36");
    			add_location(button0, file$6, 13, 12, 257);
    			add_location(li0, file$6, 12, 8, 239);
    			attr_dev(button1, "class", "svelte-1862z36");
    			add_location(button1, file$6, 16, 12, 363);
    			add_location(li1, file$6, 15, 8, 345);
    			attr_dev(button2, "class", "svelte-1862z36");
    			add_location(button2, file$6, 19, 12, 465);
    			add_location(li2, file$6, 18, 8, 447);
    			attr_dev(button3, "class", "svelte-1862z36");
    			add_location(button3, file$6, 22, 12, 565);
    			add_location(li3, file$6, 21, 8, 547);
    			attr_dev(button4, "class", "svelte-1862z36");
    			add_location(button4, file$6, 25, 12, 673);
    			add_location(li4, file$6, 24, 8, 655);
    			attr_dev(button5, "class", "svelte-1862z36");
    			add_location(button5, file$6, 28, 12, 779);
    			add_location(li5, file$6, 27, 8, 761);
    			attr_dev(ul, "class", "svelte-1862z36");
    			add_location(ul, file$6, 11, 4, 225);
    			attr_dev(nav, "class", "svelte-1862z36");
    			add_location(nav, file$6, 10, 0, 214);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, nav, anchor);
    			append_dev(nav, ul);
    			append_dev(ul, li0);
    			append_dev(li0, button0);
    			append_dev(ul, t1);
    			append_dev(ul, li1);
    			append_dev(li1, button1);
    			append_dev(ul, t3);
    			append_dev(ul, li2);
    			append_dev(li2, button2);
    			append_dev(ul, t5);
    			append_dev(ul, li3);
    			append_dev(li3, button3);
    			append_dev(ul, t7);
    			append_dev(ul, li4);
    			append_dev(li4, button4);
    			append_dev(ul, t9);
    			append_dev(ul, li5);
    			append_dev(li5, button5);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[1], false, false, false, false),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[2], false, false, false, false),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[3], false, false, false, false),
    					listen_dev(button3, "click", /*click_handler_3*/ ctx[4], false, false, false, false),
    					listen_dev(button4, "click", /*click_handler_4*/ ctx[5], false, false, false, false),
    					listen_dev(button5, "click", /*click_handler_5*/ ctx[6], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(nav);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Nav', slots, []);
    	const dispatch = createEventDispatcher();

    	async function setNavView(value) {
    		dispatch('changeView', value);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Nav> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => setNavView('Comment');
    	const click_handler_1 = () => setNavView('Debug');
    	const click_handler_2 = () => setNavView('Test');
    	const click_handler_3 = () => setNavView('Optimize');
    	const click_handler_4 = () => setNavView('Rewrite');
    	const click_handler_5 = () => setNavView('Clean');

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		dispatch,
    		setNavView
    	});

    	return [
    		setNavView,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		click_handler_4,
    		click_handler_5
    	];
    }

    class Nav extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Nav",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    /* webviews\components\Debug.svelte generated by Svelte v3.59.2 */

    const { console: console_1$6 } = globals;
    const file$5 = "webviews\\components\\Debug.svelte";

    function create_fragment$6(ctx) {
    	let h1;
    	let t1;
    	let button0;
    	let t3;
    	let textarea0;
    	let t4;
    	let button1;
    	let t6;
    	let textarea1;
    	let t7;
    	let button2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "Debug view";
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Selection to prompt";
    			t3 = space();
    			textarea0 = element("textarea");
    			t4 = space();
    			button1 = element("button");
    			button1.textContent = "Generate traced code";
    			t6 = space();
    			textarea1 = element("textarea");
    			t7 = space();
    			button2 = element("button");
    			button2.textContent = "Replace selected text";
    			add_location(h1, file$5, 19, 0, 510);
    			add_location(button0, file$5, 20, 0, 531);
    			attr_dev(textarea0, "placeholder", "Prompt code");
    			set_style(textarea0, "width", "100%");
    			set_style(textarea0, "height", "200px");
    			add_location(textarea0, file$5, 22, 0, 606);
    			add_location(button1, file$5, 25, 0, 719);
    			attr_dev(textarea1, "placeholder", "Response...");
    			set_style(textarea1, "width", "100%");
    			set_style(textarea1, "height", "200px");
    			add_location(textarea1, file$5, 27, 0, 807);
    			add_location(button2, file$5, 30, 0, 922);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, textarea0, anchor);
    			set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, textarea1, anchor);
    			set_input_value(textarea1, /*responseText*/ ctx[4]);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, button2, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[5], false, false, false, false),
    					listen_dev(textarea0, "input", /*textarea0_input_handler*/ ctx[6]),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[7], false, false, false, false),
    					listen_dev(textarea1, "input", /*textarea1_input_handler*/ ctx[8]),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[9], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*copiedText*/ 8) {
    				set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			}

    			if (dirty & /*responseText*/ 16) {
    				set_input_value(textarea1, /*responseText*/ ctx[4]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(textarea0);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(textarea1);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(button2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Debug', slots, []);
    	let { getSelectedText } = $$props;
    	let { sendText } = $$props;
    	let { replaceSelectedText } = $$props;
    	console.log(getSelectedText);
    	let copiedText = '';
    	let responseText = '';

    	window.addEventListener('message', event => {
    		const message = event.data;

    		if (message.type === 'setCopiedText') {
    			$$invalidate(3, copiedText = message.value);
    		} else if (message.type === 'responseText') {
    			$$invalidate(4, responseText = message.value);
    		}
    	});

    	$$self.$$.on_mount.push(function () {
    		if (getSelectedText === undefined && !('getSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['getSelectedText']])) {
    			console_1$6.warn("<Debug> was created without expected prop 'getSelectedText'");
    		}

    		if (sendText === undefined && !('sendText' in $$props || $$self.$$.bound[$$self.$$.props['sendText']])) {
    			console_1$6.warn("<Debug> was created without expected prop 'sendText'");
    		}

    		if (replaceSelectedText === undefined && !('replaceSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['replaceSelectedText']])) {
    			console_1$6.warn("<Debug> was created without expected prop 'replaceSelectedText'");
    		}
    	});

    	const writable_props = ['getSelectedText', 'sendText', 'replaceSelectedText'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$6.warn(`<Debug> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => getSelectedText();

    	function textarea0_input_handler() {
    		copiedText = this.value;
    		$$invalidate(3, copiedText);
    	}

    	const click_handler_1 = () => sendText(copiedText, 'Debug');

    	function textarea1_input_handler() {
    		responseText = this.value;
    		$$invalidate(4, responseText);
    	}

    	const click_handler_2 = () => replaceSelectedText(responseText);

    	$$self.$$set = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    	};

    	$$self.$capture_state = () => ({
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText
    	});

    	$$self.$inject_state = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    		if ('copiedText' in $$props) $$invalidate(3, copiedText = $$props.copiedText);
    		if ('responseText' in $$props) $$invalidate(4, responseText = $$props.responseText);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText,
    		click_handler,
    		textarea0_input_handler,
    		click_handler_1,
    		textarea1_input_handler,
    		click_handler_2
    	];
    }

    class Debug extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			getSelectedText: 0,
    			sendText: 1,
    			replaceSelectedText: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Debug",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get getSelectedText() {
    		throw new Error("<Debug>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getSelectedText(value) {
    		throw new Error("<Debug>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sendText() {
    		throw new Error("<Debug>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sendText(value) {
    		throw new Error("<Debug>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replaceSelectedText() {
    		throw new Error("<Debug>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replaceSelectedText(value) {
    		throw new Error("<Debug>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews\components\Test.svelte generated by Svelte v3.59.2 */

    const { console: console_1$5 } = globals;
    const file$4 = "webviews\\components\\Test.svelte";

    function create_fragment$5(ctx) {
    	let h1;
    	let t1;
    	let button0;
    	let t3;
    	let textarea0;
    	let t4;
    	let button1;
    	let t6;
    	let textarea1;
    	let t7;
    	let button2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "Test view";
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Selection to prompt";
    			t3 = space();
    			textarea0 = element("textarea");
    			t4 = space();
    			button1 = element("button");
    			button1.textContent = "Generate code with tests";
    			t6 = space();
    			textarea1 = element("textarea");
    			t7 = space();
    			button2 = element("button");
    			button2.textContent = "Replace selected text";
    			add_location(h1, file$4, 19, 0, 510);
    			add_location(button0, file$4, 20, 0, 530);
    			attr_dev(textarea0, "placeholder", "Prompt code");
    			set_style(textarea0, "width", "100%");
    			set_style(textarea0, "height", "200px");
    			add_location(textarea0, file$4, 22, 0, 605);
    			add_location(button1, file$4, 25, 0, 718);
    			attr_dev(textarea1, "placeholder", "Response...");
    			set_style(textarea1, "width", "100%");
    			set_style(textarea1, "height", "200px");
    			add_location(textarea1, file$4, 27, 0, 809);
    			add_location(button2, file$4, 30, 0, 924);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, textarea0, anchor);
    			set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, textarea1, anchor);
    			set_input_value(textarea1, /*responseText*/ ctx[4]);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, button2, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[5], false, false, false, false),
    					listen_dev(textarea0, "input", /*textarea0_input_handler*/ ctx[6]),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[7], false, false, false, false),
    					listen_dev(textarea1, "input", /*textarea1_input_handler*/ ctx[8]),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[9], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*copiedText*/ 8) {
    				set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			}

    			if (dirty & /*responseText*/ 16) {
    				set_input_value(textarea1, /*responseText*/ ctx[4]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(textarea0);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(textarea1);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(button2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Test', slots, []);
    	let { getSelectedText } = $$props;
    	let { sendText } = $$props;
    	let { replaceSelectedText } = $$props;
    	console.log(getSelectedText);
    	let copiedText = '';
    	let responseText = '';

    	window.addEventListener('message', event => {
    		const message = event.data;

    		if (message.type === 'setCopiedText') {
    			$$invalidate(3, copiedText = message.value);
    		} else if (message.type === 'responseText') {
    			$$invalidate(4, responseText = message.value);
    		}
    	});

    	$$self.$$.on_mount.push(function () {
    		if (getSelectedText === undefined && !('getSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['getSelectedText']])) {
    			console_1$5.warn("<Test> was created without expected prop 'getSelectedText'");
    		}

    		if (sendText === undefined && !('sendText' in $$props || $$self.$$.bound[$$self.$$.props['sendText']])) {
    			console_1$5.warn("<Test> was created without expected prop 'sendText'");
    		}

    		if (replaceSelectedText === undefined && !('replaceSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['replaceSelectedText']])) {
    			console_1$5.warn("<Test> was created without expected prop 'replaceSelectedText'");
    		}
    	});

    	const writable_props = ['getSelectedText', 'sendText', 'replaceSelectedText'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$5.warn(`<Test> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => getSelectedText();

    	function textarea0_input_handler() {
    		copiedText = this.value;
    		$$invalidate(3, copiedText);
    	}

    	const click_handler_1 = () => sendText(copiedText, 'Test');

    	function textarea1_input_handler() {
    		responseText = this.value;
    		$$invalidate(4, responseText);
    	}

    	const click_handler_2 = () => replaceSelectedText(responseText);

    	$$self.$$set = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    	};

    	$$self.$capture_state = () => ({
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText
    	});

    	$$self.$inject_state = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    		if ('copiedText' in $$props) $$invalidate(3, copiedText = $$props.copiedText);
    		if ('responseText' in $$props) $$invalidate(4, responseText = $$props.responseText);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText,
    		click_handler,
    		textarea0_input_handler,
    		click_handler_1,
    		textarea1_input_handler,
    		click_handler_2
    	];
    }

    class Test extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			getSelectedText: 0,
    			sendText: 1,
    			replaceSelectedText: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Test",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get getSelectedText() {
    		throw new Error("<Test>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getSelectedText(value) {
    		throw new Error("<Test>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sendText() {
    		throw new Error("<Test>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sendText(value) {
    		throw new Error("<Test>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replaceSelectedText() {
    		throw new Error("<Test>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replaceSelectedText(value) {
    		throw new Error("<Test>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews\components\Optimize.svelte generated by Svelte v3.59.2 */

    const { console: console_1$4 } = globals;
    const file$3 = "webviews\\components\\Optimize.svelte";

    function create_fragment$4(ctx) {
    	let h1;
    	let t1;
    	let button0;
    	let t3;
    	let textarea0;
    	let t4;
    	let button1;
    	let t6;
    	let textarea1;
    	let t7;
    	let button2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "Optimize view";
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Selection to prompt";
    			t3 = space();
    			textarea0 = element("textarea");
    			t4 = space();
    			button1 = element("button");
    			button1.textContent = "Generate optimized code";
    			t6 = space();
    			textarea1 = element("textarea");
    			t7 = space();
    			button2 = element("button");
    			button2.textContent = "Replace selected text";
    			add_location(h1, file$3, 19, 0, 510);
    			add_location(button0, file$3, 20, 0, 534);
    			attr_dev(textarea0, "placeholder", "Prompt code");
    			set_style(textarea0, "width", "100%");
    			set_style(textarea0, "height", "200px");
    			add_location(textarea0, file$3, 22, 0, 609);
    			add_location(button1, file$3, 25, 0, 722);
    			attr_dev(textarea1, "placeholder", "Response...");
    			set_style(textarea1, "width", "100%");
    			set_style(textarea1, "height", "200px");
    			add_location(textarea1, file$3, 27, 0, 816);
    			add_location(button2, file$3, 30, 0, 931);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, textarea0, anchor);
    			set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, textarea1, anchor);
    			set_input_value(textarea1, /*responseText*/ ctx[4]);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, button2, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[5], false, false, false, false),
    					listen_dev(textarea0, "input", /*textarea0_input_handler*/ ctx[6]),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[7], false, false, false, false),
    					listen_dev(textarea1, "input", /*textarea1_input_handler*/ ctx[8]),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[9], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*copiedText*/ 8) {
    				set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			}

    			if (dirty & /*responseText*/ 16) {
    				set_input_value(textarea1, /*responseText*/ ctx[4]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(textarea0);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(textarea1);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(button2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Optimize', slots, []);
    	let { getSelectedText } = $$props;
    	let { sendText } = $$props;
    	let { replaceSelectedText } = $$props;
    	console.log(getSelectedText);
    	let copiedText = '';
    	let responseText = '';

    	window.addEventListener('message', event => {
    		const message = event.data;

    		if (message.type === 'setCopiedText') {
    			$$invalidate(3, copiedText = message.value);
    		} else if (message.type === 'responseText') {
    			$$invalidate(4, responseText = message.value);
    		}
    	});

    	$$self.$$.on_mount.push(function () {
    		if (getSelectedText === undefined && !('getSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['getSelectedText']])) {
    			console_1$4.warn("<Optimize> was created without expected prop 'getSelectedText'");
    		}

    		if (sendText === undefined && !('sendText' in $$props || $$self.$$.bound[$$self.$$.props['sendText']])) {
    			console_1$4.warn("<Optimize> was created without expected prop 'sendText'");
    		}

    		if (replaceSelectedText === undefined && !('replaceSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['replaceSelectedText']])) {
    			console_1$4.warn("<Optimize> was created without expected prop 'replaceSelectedText'");
    		}
    	});

    	const writable_props = ['getSelectedText', 'sendText', 'replaceSelectedText'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$4.warn(`<Optimize> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => getSelectedText();

    	function textarea0_input_handler() {
    		copiedText = this.value;
    		$$invalidate(3, copiedText);
    	}

    	const click_handler_1 = () => sendText(copiedText, 'Optimize');

    	function textarea1_input_handler() {
    		responseText = this.value;
    		$$invalidate(4, responseText);
    	}

    	const click_handler_2 = () => replaceSelectedText(responseText);

    	$$self.$$set = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    	};

    	$$self.$capture_state = () => ({
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText
    	});

    	$$self.$inject_state = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    		if ('copiedText' in $$props) $$invalidate(3, copiedText = $$props.copiedText);
    		if ('responseText' in $$props) $$invalidate(4, responseText = $$props.responseText);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText,
    		click_handler,
    		textarea0_input_handler,
    		click_handler_1,
    		textarea1_input_handler,
    		click_handler_2
    	];
    }

    class Optimize extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			getSelectedText: 0,
    			sendText: 1,
    			replaceSelectedText: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Optimize",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get getSelectedText() {
    		throw new Error("<Optimize>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getSelectedText(value) {
    		throw new Error("<Optimize>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sendText() {
    		throw new Error("<Optimize>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sendText(value) {
    		throw new Error("<Optimize>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replaceSelectedText() {
    		throw new Error("<Optimize>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replaceSelectedText(value) {
    		throw new Error("<Optimize>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews\components\Rewrite.svelte generated by Svelte v3.59.2 */

    const { console: console_1$3 } = globals;
    const file$2 = "webviews\\components\\Rewrite.svelte";

    function create_fragment$3(ctx) {
    	let h1;
    	let t1;
    	let button0;
    	let t3;
    	let textarea0;
    	let t4;
    	let button1;
    	let t6;
    	let textarea1;
    	let t7;
    	let button2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "Rewrite view";
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Selection to prompt";
    			t3 = space();
    			textarea0 = element("textarea");
    			t4 = space();
    			button1 = element("button");
    			button1.textContent = "Generate rewrited code";
    			t6 = space();
    			textarea1 = element("textarea");
    			t7 = space();
    			button2 = element("button");
    			button2.textContent = "Replace selected text";
    			add_location(h1, file$2, 19, 0, 510);
    			add_location(button0, file$2, 20, 0, 533);
    			attr_dev(textarea0, "placeholder", "Prompt code");
    			set_style(textarea0, "width", "100%");
    			set_style(textarea0, "height", "200px");
    			add_location(textarea0, file$2, 22, 0, 608);
    			add_location(button1, file$2, 25, 0, 721);
    			attr_dev(textarea1, "placeholder", "Response...");
    			set_style(textarea1, "width", "100%");
    			set_style(textarea1, "height", "200px");
    			add_location(textarea1, file$2, 27, 0, 813);
    			add_location(button2, file$2, 30, 0, 928);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, textarea0, anchor);
    			set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, textarea1, anchor);
    			set_input_value(textarea1, /*responseText*/ ctx[4]);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, button2, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[5], false, false, false, false),
    					listen_dev(textarea0, "input", /*textarea0_input_handler*/ ctx[6]),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[7], false, false, false, false),
    					listen_dev(textarea1, "input", /*textarea1_input_handler*/ ctx[8]),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[9], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*copiedText*/ 8) {
    				set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			}

    			if (dirty & /*responseText*/ 16) {
    				set_input_value(textarea1, /*responseText*/ ctx[4]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(textarea0);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(textarea1);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(button2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Rewrite', slots, []);
    	let { getSelectedText } = $$props;
    	let { sendText } = $$props;
    	let { replaceSelectedText } = $$props;
    	console.log(getSelectedText);
    	let copiedText = '';
    	let responseText = '';

    	window.addEventListener('message', event => {
    		const message = event.data;

    		if (message.type === 'setCopiedText') {
    			$$invalidate(3, copiedText = message.value);
    		} else if (message.type === 'responseText') {
    			$$invalidate(4, responseText = message.value);
    		}
    	});

    	$$self.$$.on_mount.push(function () {
    		if (getSelectedText === undefined && !('getSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['getSelectedText']])) {
    			console_1$3.warn("<Rewrite> was created without expected prop 'getSelectedText'");
    		}

    		if (sendText === undefined && !('sendText' in $$props || $$self.$$.bound[$$self.$$.props['sendText']])) {
    			console_1$3.warn("<Rewrite> was created without expected prop 'sendText'");
    		}

    		if (replaceSelectedText === undefined && !('replaceSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['replaceSelectedText']])) {
    			console_1$3.warn("<Rewrite> was created without expected prop 'replaceSelectedText'");
    		}
    	});

    	const writable_props = ['getSelectedText', 'sendText', 'replaceSelectedText'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$3.warn(`<Rewrite> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => getSelectedText();

    	function textarea0_input_handler() {
    		copiedText = this.value;
    		$$invalidate(3, copiedText);
    	}

    	const click_handler_1 = () => sendText(copiedText, 'Rewrite');

    	function textarea1_input_handler() {
    		responseText = this.value;
    		$$invalidate(4, responseText);
    	}

    	const click_handler_2 = () => replaceSelectedText(responseText);

    	$$self.$$set = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    	};

    	$$self.$capture_state = () => ({
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText
    	});

    	$$self.$inject_state = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    		if ('copiedText' in $$props) $$invalidate(3, copiedText = $$props.copiedText);
    		if ('responseText' in $$props) $$invalidate(4, responseText = $$props.responseText);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText,
    		click_handler,
    		textarea0_input_handler,
    		click_handler_1,
    		textarea1_input_handler,
    		click_handler_2
    	];
    }

    class Rewrite extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			getSelectedText: 0,
    			sendText: 1,
    			replaceSelectedText: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Rewrite",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get getSelectedText() {
    		throw new Error("<Rewrite>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getSelectedText(value) {
    		throw new Error("<Rewrite>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sendText() {
    		throw new Error("<Rewrite>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sendText(value) {
    		throw new Error("<Rewrite>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replaceSelectedText() {
    		throw new Error("<Rewrite>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replaceSelectedText(value) {
    		throw new Error("<Rewrite>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews\components\Clean.svelte generated by Svelte v3.59.2 */

    const { console: console_1$2 } = globals;
    const file$1 = "webviews\\components\\Clean.svelte";

    function create_fragment$2(ctx) {
    	let h1;
    	let t1;
    	let button0;
    	let t3;
    	let textarea0;
    	let t4;
    	let button1;
    	let t6;
    	let textarea1;
    	let t7;
    	let button2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "Clean view";
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Selection to prompt";
    			t3 = space();
    			textarea0 = element("textarea");
    			t4 = space();
    			button1 = element("button");
    			button1.textContent = "Generate cleaned code";
    			t6 = space();
    			textarea1 = element("textarea");
    			t7 = space();
    			button2 = element("button");
    			button2.textContent = "Replace selected text";
    			add_location(h1, file$1, 19, 0, 510);
    			add_location(button0, file$1, 20, 0, 531);
    			attr_dev(textarea0, "placeholder", "Prompt code");
    			set_style(textarea0, "width", "100%");
    			set_style(textarea0, "height", "200px");
    			add_location(textarea0, file$1, 22, 0, 606);
    			add_location(button1, file$1, 25, 0, 719);
    			attr_dev(textarea1, "placeholder", "Response...");
    			set_style(textarea1, "width", "100%");
    			set_style(textarea1, "height", "200px");
    			add_location(textarea1, file$1, 27, 0, 808);
    			add_location(button2, file$1, 30, 0, 923);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, textarea0, anchor);
    			set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, textarea1, anchor);
    			set_input_value(textarea1, /*responseText*/ ctx[4]);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, button2, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[5], false, false, false, false),
    					listen_dev(textarea0, "input", /*textarea0_input_handler*/ ctx[6]),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[7], false, false, false, false),
    					listen_dev(textarea1, "input", /*textarea1_input_handler*/ ctx[8]),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[9], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*copiedText*/ 8) {
    				set_input_value(textarea0, /*copiedText*/ ctx[3]);
    			}

    			if (dirty & /*responseText*/ 16) {
    				set_input_value(textarea1, /*responseText*/ ctx[4]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(textarea0);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(textarea1);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(button2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Clean', slots, []);
    	let { getSelectedText } = $$props;
    	let { sendText } = $$props;
    	let { replaceSelectedText } = $$props;
    	console.log(getSelectedText);
    	let copiedText = '';
    	let responseText = '';

    	window.addEventListener('message', event => {
    		const message = event.data;

    		if (message.type === 'setCopiedText') {
    			$$invalidate(3, copiedText = message.value);
    		} else if (message.type === 'responseText') {
    			$$invalidate(4, responseText = message.value);
    		}
    	});

    	$$self.$$.on_mount.push(function () {
    		if (getSelectedText === undefined && !('getSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['getSelectedText']])) {
    			console_1$2.warn("<Clean> was created without expected prop 'getSelectedText'");
    		}

    		if (sendText === undefined && !('sendText' in $$props || $$self.$$.bound[$$self.$$.props['sendText']])) {
    			console_1$2.warn("<Clean> was created without expected prop 'sendText'");
    		}

    		if (replaceSelectedText === undefined && !('replaceSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['replaceSelectedText']])) {
    			console_1$2.warn("<Clean> was created without expected prop 'replaceSelectedText'");
    		}
    	});

    	const writable_props = ['getSelectedText', 'sendText', 'replaceSelectedText'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$2.warn(`<Clean> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => getSelectedText();

    	function textarea0_input_handler() {
    		copiedText = this.value;
    		$$invalidate(3, copiedText);
    	}

    	const click_handler_1 = () => sendText(copiedText, 'Clean');

    	function textarea1_input_handler() {
    		responseText = this.value;
    		$$invalidate(4, responseText);
    	}

    	const click_handler_2 = () => replaceSelectedText(responseText);

    	$$self.$$set = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    	};

    	$$self.$capture_state = () => ({
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText
    	});

    	$$self.$inject_state = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    		if ('copiedText' in $$props) $$invalidate(3, copiedText = $$props.copiedText);
    		if ('responseText' in $$props) $$invalidate(4, responseText = $$props.responseText);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		copiedText,
    		responseText,
    		click_handler,
    		textarea0_input_handler,
    		click_handler_1,
    		textarea1_input_handler,
    		click_handler_2
    	];
    }

    class Clean extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			getSelectedText: 0,
    			sendText: 1,
    			replaceSelectedText: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Clean",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get getSelectedText() {
    		throw new Error("<Clean>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getSelectedText(value) {
    		throw new Error("<Clean>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sendText() {
    		throw new Error("<Clean>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sendText(value) {
    		throw new Error("<Clean>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replaceSelectedText() {
    		throw new Error("<Clean>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replaceSelectedText(value) {
    		throw new Error("<Clean>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews\components\Comment.svelte generated by Svelte v3.59.2 */

    const { console: console_1$1 } = globals;
    const file = "webviews\\components\\Comment.svelte";

    function create_fragment$1(ctx) {
    	let h1;
    	let t1;
    	let button0;
    	let t3;
    	let textarea0;
    	let t4;
    	let button1;
    	let t6;
    	let textarea1;
    	let t7;
    	let button2;
    	let t9;
    	let div;
    	let t10;
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "Comment view";
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Selection to prompt";
    			t3 = space();
    			textarea0 = element("textarea");
    			t4 = space();
    			button1 = element("button");
    			button1.textContent = "Generate commented code";
    			t6 = space();
    			textarea1 = element("textarea");
    			t7 = space();
    			button2 = element("button");
    			button2.textContent = "Replace selected text";
    			t9 = space();
    			div = element("div");
    			t10 = text("Detailed and long comments:\r\n    ");
    			input = element("input");
    			add_location(h1, file, 20, 0, 539);
    			add_location(button0, file, 21, 0, 562);
    			attr_dev(textarea0, "placeholder", "Prompt code");
    			set_style(textarea0, "width", "100%");
    			set_style(textarea0, "height", "200px");
    			add_location(textarea0, file, 23, 0, 637);
    			add_location(button1, file, 26, 0, 750);
    			attr_dev(textarea1, "placeholder", "Response...");
    			set_style(textarea1, "width", "100%");
    			set_style(textarea1, "height", "200px");
    			add_location(textarea1, file, 30, 0, 889);
    			add_location(button2, file, 33, 0, 1004);
    			attr_dev(input, "type", "checkbox");
    			add_location(input, file, 37, 4, 1141);
    			add_location(div, file, 35, 0, 1097);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, textarea0, anchor);
    			set_input_value(textarea0, /*copiedText*/ ctx[4]);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, textarea1, anchor);
    			set_input_value(textarea1, /*responseText*/ ctx[5]);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, button2, anchor);
    			insert_dev(target, t9, anchor);
    			insert_dev(target, div, anchor);
    			append_dev(div, t10);
    			append_dev(div, input);
    			input.checked = /*longcoment*/ ctx[3];

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[6], false, false, false, false),
    					listen_dev(textarea0, "input", /*textarea0_input_handler*/ ctx[7]),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[8], false, false, false, false),
    					listen_dev(textarea1, "input", /*textarea1_input_handler*/ ctx[9]),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[10], false, false, false, false),
    					listen_dev(input, "change", /*input_change_handler*/ ctx[11])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*copiedText*/ 16) {
    				set_input_value(textarea0, /*copiedText*/ ctx[4]);
    			}

    			if (dirty & /*responseText*/ 32) {
    				set_input_value(textarea1, /*responseText*/ ctx[5]);
    			}

    			if (dirty & /*longcoment*/ 8) {
    				input.checked = /*longcoment*/ ctx[3];
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(textarea0);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(textarea1);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(button2);
    			if (detaching) detach_dev(t9);
    			if (detaching) detach_dev(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Comment', slots, []);
    	let { getSelectedText } = $$props;
    	let { sendText } = $$props;
    	let { replaceSelectedText } = $$props;
    	let longcoment = false;
    	console.log(getSelectedText);
    	let copiedText = '';
    	let responseText = '';

    	window.addEventListener('message', event => {
    		const message = event.data;

    		if (message.type === 'setCopiedText') {
    			$$invalidate(4, copiedText = message.value);
    		} else if (message.type === 'responseText') {
    			$$invalidate(5, responseText = message.value);
    		}
    	});

    	$$self.$$.on_mount.push(function () {
    		if (getSelectedText === undefined && !('getSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['getSelectedText']])) {
    			console_1$1.warn("<Comment> was created without expected prop 'getSelectedText'");
    		}

    		if (sendText === undefined && !('sendText' in $$props || $$self.$$.bound[$$self.$$.props['sendText']])) {
    			console_1$1.warn("<Comment> was created without expected prop 'sendText'");
    		}

    		if (replaceSelectedText === undefined && !('replaceSelectedText' in $$props || $$self.$$.bound[$$self.$$.props['replaceSelectedText']])) {
    			console_1$1.warn("<Comment> was created without expected prop 'replaceSelectedText'");
    		}
    	});

    	const writable_props = ['getSelectedText', 'sendText', 'replaceSelectedText'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$1.warn(`<Comment> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => getSelectedText();

    	function textarea0_input_handler() {
    		copiedText = this.value;
    		$$invalidate(4, copiedText);
    	}

    	const click_handler_1 = () => sendText(copiedText, longcoment == true ? 'Long Comment' : 'Comment');

    	function textarea1_input_handler() {
    		responseText = this.value;
    		$$invalidate(5, responseText);
    	}

    	const click_handler_2 = () => replaceSelectedText(responseText);

    	function input_change_handler() {
    		longcoment = this.checked;
    		$$invalidate(3, longcoment);
    	}

    	$$self.$$set = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    	};

    	$$self.$capture_state = () => ({
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		longcoment,
    		copiedText,
    		responseText
    	});

    	$$self.$inject_state = $$props => {
    		if ('getSelectedText' in $$props) $$invalidate(0, getSelectedText = $$props.getSelectedText);
    		if ('sendText' in $$props) $$invalidate(1, sendText = $$props.sendText);
    		if ('replaceSelectedText' in $$props) $$invalidate(2, replaceSelectedText = $$props.replaceSelectedText);
    		if ('longcoment' in $$props) $$invalidate(3, longcoment = $$props.longcoment);
    		if ('copiedText' in $$props) $$invalidate(4, copiedText = $$props.copiedText);
    		if ('responseText' in $$props) $$invalidate(5, responseText = $$props.responseText);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		getSelectedText,
    		sendText,
    		replaceSelectedText,
    		longcoment,
    		copiedText,
    		responseText,
    		click_handler,
    		textarea0_input_handler,
    		click_handler_1,
    		textarea1_input_handler,
    		click_handler_2,
    		input_change_handler
    	];
    }

    class Comment extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			getSelectedText: 0,
    			sendText: 1,
    			replaceSelectedText: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Comment",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get getSelectedText() {
    		throw new Error("<Comment>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getSelectedText(value) {
    		throw new Error("<Comment>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sendText() {
    		throw new Error("<Comment>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sendText(value) {
    		throw new Error("<Comment>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replaceSelectedText() {
    		throw new Error("<Comment>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replaceSelectedText(value) {
    		throw new Error("<Comment>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews\components\Sidebar.svelte generated by Svelte v3.59.2 */

    const { console: console_1 } = globals;

    // (45:0) {#if currentView === 'Comment'}
    function create_if_block_5(ctx) {
    	let comment_1;
    	let current;

    	comment_1 = new Comment({
    			props: {
    				getSelectedText: /*getSelectedText*/ ctx[2],
    				sendText: /*sendText*/ ctx[3],
    				replaceSelectedText: /*replaceSelectedText*/ ctx[4]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(comment_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(comment_1, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(comment_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(comment_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(comment_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(45:0) {#if currentView === 'Comment'}",
    		ctx
    	});

    	return block;
    }

    // (48:0) {#if currentView === 'Debug'}
    function create_if_block_4(ctx) {
    	let debug_1;
    	let current;

    	debug_1 = new Debug({
    			props: {
    				getSelectedText: /*getSelectedText*/ ctx[2],
    				sendText: /*sendText*/ ctx[3],
    				replaceSelectedText: /*replaceSelectedText*/ ctx[4]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(debug_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(debug_1, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(debug_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(debug_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(debug_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(48:0) {#if currentView === 'Debug'}",
    		ctx
    	});

    	return block;
    }

    // (51:0) {#if currentView === 'Test'}
    function create_if_block_3(ctx) {
    	let test;
    	let current;

    	test = new Test({
    			props: {
    				getSelectedText: /*getSelectedText*/ ctx[2],
    				sendText: /*sendText*/ ctx[3],
    				replaceSelectedText: /*replaceSelectedText*/ ctx[4]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(test.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(test, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(test.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(test.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(test, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(51:0) {#if currentView === 'Test'}",
    		ctx
    	});

    	return block;
    }

    // (54:0) {#if currentView === 'Optimize'}
    function create_if_block_2(ctx) {
    	let optimize;
    	let current;

    	optimize = new Optimize({
    			props: {
    				getSelectedText: /*getSelectedText*/ ctx[2],
    				sendText: /*sendText*/ ctx[3],
    				replaceSelectedText: /*replaceSelectedText*/ ctx[4]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(optimize.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(optimize, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(optimize.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(optimize.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(optimize, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(54:0) {#if currentView === 'Optimize'}",
    		ctx
    	});

    	return block;
    }

    // (57:0) {#if currentView === 'Rewrite'}
    function create_if_block_1(ctx) {
    	let rewrite;
    	let current;

    	rewrite = new Rewrite({
    			props: {
    				getSelectedText: /*getSelectedText*/ ctx[2],
    				sendText: /*sendText*/ ctx[3],
    				replaceSelectedText: /*replaceSelectedText*/ ctx[4]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(rewrite.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(rewrite, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(rewrite.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(rewrite.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(rewrite, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(57:0) {#if currentView === 'Rewrite'}",
    		ctx
    	});

    	return block;
    }

    // (60:0) {#if currentView === 'Clean'}
    function create_if_block(ctx) {
    	let clean;
    	let current;

    	clean = new Clean({
    			props: {
    				getSelectedText: /*getSelectedText*/ ctx[2],
    				sendText: /*sendText*/ ctx[3],
    				replaceSelectedText: /*replaceSelectedText*/ ctx[4]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(clean.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(clean, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(clean.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(clean.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(clean, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(60:0) {#if currentView === 'Clean'}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let nav;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let if_block5_anchor;
    	let current;
    	nav = new Nav({ $$inline: true });
    	nav.$on("changeView", /*changeView*/ ctx[1]);
    	let if_block0 = /*currentView*/ ctx[0] === 'Comment' && create_if_block_5(ctx);
    	let if_block1 = /*currentView*/ ctx[0] === 'Debug' && create_if_block_4(ctx);
    	let if_block2 = /*currentView*/ ctx[0] === 'Test' && create_if_block_3(ctx);
    	let if_block3 = /*currentView*/ ctx[0] === 'Optimize' && create_if_block_2(ctx);
    	let if_block4 = /*currentView*/ ctx[0] === 'Rewrite' && create_if_block_1(ctx);
    	let if_block5 = /*currentView*/ ctx[0] === 'Clean' && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			create_component(nav.$$.fragment);
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (if_block2) if_block2.c();
    			t3 = space();
    			if (if_block3) if_block3.c();
    			t4 = space();
    			if (if_block4) if_block4.c();
    			t5 = space();
    			if (if_block5) if_block5.c();
    			if_block5_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(nav, target, anchor);
    			insert_dev(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t1, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, t2, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert_dev(target, t3, anchor);
    			if (if_block3) if_block3.m(target, anchor);
    			insert_dev(target, t4, anchor);
    			if (if_block4) if_block4.m(target, anchor);
    			insert_dev(target, t5, anchor);
    			if (if_block5) if_block5.m(target, anchor);
    			insert_dev(target, if_block5_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*currentView*/ ctx[0] === 'Comment') {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*currentView*/ 1) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*currentView*/ ctx[0] === 'Debug') {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*currentView*/ 1) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_4(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t2.parentNode, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*currentView*/ ctx[0] === 'Test') {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty & /*currentView*/ 1) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_3(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(t3.parentNode, t3);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*currentView*/ ctx[0] === 'Optimize') {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty & /*currentView*/ 1) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_2(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(t4.parentNode, t4);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*currentView*/ ctx[0] === 'Rewrite') {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty & /*currentView*/ 1) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_1(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(t5.parentNode, t5);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (/*currentView*/ ctx[0] === 'Clean') {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty & /*currentView*/ 1) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(if_block5_anchor.parentNode, if_block5_anchor);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(nav.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(if_block5);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(nav.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(if_block5);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(nav, detaching);
    			if (detaching) detach_dev(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t1);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(t2);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach_dev(t3);
    			if (if_block3) if_block3.d(detaching);
    			if (detaching) detach_dev(t4);
    			if (if_block4) if_block4.d(detaching);
    			if (detaching) detach_dev(t5);
    			if (if_block5) if_block5.d(detaching);
    			if (detaching) detach_dev(if_block5_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Sidebar', slots, []);
    	const vscode = acquireVsCodeApi();
    	let currentView = 'Comment';

    	function changeView(view) {
    		$$invalidate(0, currentView = view.detail);
    	}

    	async function getSelectedText() {
    		try {
    			await vscode.postMessage({ type: 'gettext' });
    		} catch(error) {
    			console.log('Error executing command:', error);
    		}
    	}

    	async function sendText(copiedText, view) {
    		try {
    			await vscode.postMessage({
    				type: 'sendtext',
    				value: copiedText,
    				view
    			});
    		} catch(error) {
    			console.log('Error executing command:', error);
    		}
    	}

    	async function replaceSelectedText(responseText) {
    		try {
    			await vscode.postMessage({ type: 'replacetext', value: responseText });
    		} catch(error) {
    			console.log('Error executing command:', error);
    		}
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<Sidebar> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		Nav,
    		Debug,
    		Test,
    		Optimize,
    		Rewrite,
    		Clean,
    		Comment,
    		vscode,
    		currentView,
    		changeView,
    		getSelectedText,
    		sendText,
    		replaceSelectedText
    	});

    	$$self.$inject_state = $$props => {
    		if ('currentView' in $$props) $$invalidate(0, currentView = $$props.currentView);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [currentView, changeView, getSelectedText, sendText, replaceSelectedText];
    }

    class Sidebar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Sidebar",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new Sidebar({
        target: document.body,
    });

    return app;

})();
//# sourceMappingURL=sidebar.js.map
