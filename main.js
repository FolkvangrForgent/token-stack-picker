const GRID_GAP_PX = 10;
const GRID_PAD_PX = 6;

class TokenStackPicker extends foundry.applications.api.ApplicationV2 {
	static DEFAULT_OPTIONS = {
		id: 'token-stack-picker',
		classes: ['token-stack-picker', 'application', 'themed'],
		window: { frame: false },
		tokenIdentifiers: []
	};

	#listenerAbortController = new AbortController();

	static async open(mousePosition, { targetMode } = {}) {
		if (!canvas.ready) return;
		mousePosition ??= canvas.mousePosition;
		if (!mousePosition) return;
		await foundry.applications.instances.get('token-stack-picker')?.close({ animate: false });
		const tokenIdentifiers = canvas.tokens.placeables
			.toReversed()
			.filter((token) => token.isVisible && token.bounds.contains(mousePosition.x, mousePosition.y))
			.map((token) => token.id);
		if (!tokenIdentifiers.length) return;
		else if (targetMode === 'all') canvas.tokens.setTargets(tokenIdentifiers);
		else if (targetMode === 'none') canvas.tokens.setTargets([]);
		const globalPosition = canvas.stage.toGlobal(mousePosition);
		const { colorScheme, uiScale } = game.settings.get('core', 'uiConfig');
		const windowCursorOffset = (GRID_PAD_PX + game.settings.get('token-stack-picker', 'gridSize') / 2) * uiScale;
		const colorSchemeName = colorScheme.applications || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
		new this({
			tokenIdentifiers,
			classes: [`theme-${colorSchemeName}`],
			position: {
				left: globalPosition.x - windowCursorOffset,
				top: globalPosition.y - windowCursorOffset,
				scale: uiScale
			}
		}).render({ force: true });
	}

	async _renderHTML() {
		const gridElement = document.createElement('div');
		gridElement.className = 'grid';
		for (const tokenIdentifier of this.options.tokenIdentifiers) {
			const tokenObject = canvas.tokens.get(tokenIdentifier);
			if (tokenObject) {
				// create portrait element
				const portraitElement = document.createElement('div');
				portraitElement.className = 'portrait';
				portraitElement.classList.toggle('targeted', tokenObject.isTargeted);
				portraitElement.classList.toggle('controlled', tokenObject.controlled);
				portraitElement.classList.toggle('obscured', !(tokenObject.document.isOwner || !tokenObject.detectionFilter));
				portraitElement.dataset.tokenIdentifier = tokenObject.id;
				if (!tokenObject.detectionFilter && (tokenObject.document.isOwner || tokenObject.document.playersCanSeeName)) {
					portraitElement.dataset.tooltip = tokenObject.document.name;
				}
				gridElement.append(portraitElement);
				// create media element
				const mediaSource = (game.settings.get('token-stack-picker', 'useActorArt') && tokenObject.actor?.img) || tokenObject.document.texture.src;
				const isVideoSource = foundry.helpers.media.VideoHelper.hasVideoExtension(mediaSource);
				const mediaElement = document.createElement(isVideoSource ? 'video' : 'img');
				if (isVideoSource) Object.assign(mediaElement, { autoplay: true, loop: true, muted: true });
				mediaElement.src = mediaSource;
				portraitElement.append(mediaElement);
				// create pips element
				this.#renderPips(portraitElement, tokenObject);
			}
		}
		return gridElement;
	}

	_replaceHTML(renderedGridElement, contentElement) {
		contentElement.replaceChildren(renderedGridElement);
	}

	async _onFirstRender(renderContext, renderOptions) {
		await super._onFirstRender(renderContext, renderOptions);
		this.element.style.setProperty('--target-color', String(game.settings.get('token-stack-picker', 'targetColor')));
		this.element.style.setProperty('--control-color', String(game.settings.get('token-stack-picker', 'controlColor')));
		this.element.style.setProperty('--grid-size', `${game.settings.get('token-stack-picker', 'gridSize')}px`);
		this.element.style.setProperty('--grid-columns', game.settings.get('token-stack-picker', 'gridColumns'));
		this.element.style.setProperty('--grid-gap', `${GRID_GAP_PX}px`);
		this.element.style.setProperty('--grid-pad', `${GRID_PAD_PX}px`);
		this.element.addEventListener('auxclick', this.#onAuxClick, { signal: this.#listenerAbortController.signal });
		this.element.addEventListener('click', this.#onClick, { signal: this.#listenerAbortController.signal });
		this.element.addEventListener('contextmenu', this.#onContextMenu, { signal: this.#listenerAbortController.signal });
		this.element.addEventListener('mousedown', this.#onMouseDown, { signal: this.#listenerAbortController.signal });
		document.addEventListener('pointerdown', this.#onPointerOutside, { capture: true, signal: this.#listenerAbortController.signal });
		// document.addEventListener('pointermove', this.#onPointerOutside, { capture: true, signal: this.#listenerAbortController.signal }); // FIX target is canvas#board
		window.addEventListener('keydown', this.#onKeyDown, { capture: true, signal: this.#listenerAbortController.signal });
		for (const [hookName, handler] of Object.entries(this.#hooks)) Hooks.on(hookName, handler);
	}

	_onClose(closeOptions) {
		super._onClose(closeOptions);
		this.#listenerAbortController.abort();
		for (const [hookName, handler] of Object.entries(this.#hooks)) Hooks.off(hookName, handler);
	}

	get #hooks() {
		return {
			targetToken: this.#onTargetToken,
			controlToken: this.#onControlToken,
			deleteToken: this.#onDeleteToken,
			canvasTearDown: this.#dismiss
		};
	}

	#matchesKeybinding(keyboardEvent, bindings, reservedModifiers = []) {
		const pressedModifiers = new Set();
		if (keyboardEvent.shiftKey) pressedModifiers.add('Shift');
		if (keyboardEvent.altKey) pressedModifiers.add('Alt');
		if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) pressedModifiers.add('Control');
		for (const reservedModifier of reservedModifiers) pressedModifiers.delete(reservedModifier);
		return bindings.some(({ key: boundKey, modifiers: boundModifiers }) =>
			boundKey === keyboardEvent.code
			&& boundModifiers.length === pressedModifiers.size
			&& boundModifiers.every(modifier => pressedModifiers.has(modifier)));
	}

	#onKeyDown = (keyboardEvent) => {
		if (keyboardEvent.code === 'Escape') {
			keyboardEvent.preventDefault();
			keyboardEvent.stopImmediatePropagation();
			this.#dismiss();
			return;
		}
		if (!this.#matchesKeybinding(keyboardEvent, game.keybindings.get('core', 'target'))) return;
		const hoveredPortraitElement = this.element.querySelector('.portrait:hover');
		const hoveredToken = canvas.tokens.get(hoveredPortraitElement?.dataset.tokenIdentifier);
		if (!hoveredToken) return;
		keyboardEvent.preventDefault();
		keyboardEvent.stopImmediatePropagation();
		if (!keyboardEvent.repeat) canvas.tokens.setTargets([hoveredToken.id], { mode: hoveredToken.isTargeted ? 'release' : 'acquire' });
	};

	#onTargetToken = (targetingUser, token, isTargeted) => {
		const portraitElement = this.element.querySelector(`[data-token-identifier="${token.id}"]`);
		if (!portraitElement) return;
		if (targetingUser === game.user) {
			portraitElement.classList.toggle('targeted', isTargeted);
		} else {
			this.#renderPips(portraitElement, token);
		}
	};

	#onControlToken = (token, isControlled) => {
		this.element.querySelector(`[data-token-identifier="${token.id}"]`)?.classList.toggle('controlled', isControlled);
	};

	#renderPips(portraitElement, token) {
		portraitElement.querySelector('.pips')?.remove();
		const otherTargetingUsers = game.users.filter((user) => user !== game.user && user.targets.has(token));
		if (!otherTargetingUsers.length) return;
		const pipsElement = document.createElement('div');
		pipsElement.className = 'pips';
		for (const user of otherTargetingUsers) {
			const pipElement = document.createElement('span');
			pipElement.className = 'pip';
			pipElement.style.setProperty('--pip-color', String(user.color));
			pipsElement.append(pipElement);
		}
		portraitElement.append(pipsElement);
	}

	#dismiss = () => {
		if (this.rendered) this.close({ animate: false });
	};

	#onPointerOutside = (pointerEvent) => {
		if (this.rendered && !this.element.contains(pointerEvent.target)) this.#dismiss();
	};

	#onDeleteToken = (tokenDocument) => {
		if (!this.rendered) return;
		const portraitElement = this.element.querySelector(`[data-token-identifier="${tokenDocument.id}"]`);
		if (!portraitElement) return;
		portraitElement.remove();
		if (!this.element.querySelector('.portrait')) this.#dismiss();
	};

	#getTokenFromEvent(mouseEvent) {
		const tokenIdentifier = mouseEvent.target.closest?.('.portrait')?.dataset.tokenIdentifier;
		return tokenIdentifier ? canvas.tokens.get(tokenIdentifier) : undefined;
	}

	#canViewActorSheet(token) {
		return !!token.actor
			&& (token.document.isOwner || !token.detectionFilter)
			&& token.actor.testUserPermission(game.user, 'LIMITED');
	}

	#openActorSheet(token) {
		const actorSheet = token.actor.sheet;
		if (actorSheet.rendered) {
			actorSheet.maximize();
			actorSheet.bringToFront();
		} else actorSheet.render({ force: true, token: token.document });
	}

	#onClick = (mouseEvent) => {
		const token = this.#getTokenFromEvent(mouseEvent);
		if (!token) return;
		const mode = mouseEvent.shiftKey ? 'acquire' : mouseEvent.altKey ? 'release' : 'replace';
		canvas.tokens.setTargets([token.id], { mode });
	};

	#onContextMenu = (mouseEvent) => {
		mouseEvent.preventDefault();
		const token = this.#getTokenFromEvent(mouseEvent);
		if (!token) return;
		if (mouseEvent.shiftKey) {
			if (token.document.isOwner) token.control({ releaseOthers: false });
		} else if (mouseEvent.altKey) {
			token.release();
		} else if (token.document.isOwner) {
			token.control({ releaseOthers: true });
		}
	};

	#onMouseDown = (mouseEvent) => {
		if (mouseEvent.button === 1) mouseEvent.preventDefault();
	};

	#onAuxClick = (mouseEvent) => {
		if (mouseEvent.button !== 1) return;
		mouseEvent.preventDefault();
		const token = this.#getTokenFromEvent(mouseEvent);
		if (!token || !this.#canViewActorSheet(token)) return;
		this.#openActorSheet(token);
		this.#dismiss();
	};
}

Hooks.once('init', () => {
	game.settings.register('token-stack-picker', 'useActorArt', {
		name: 'TokenStackPicker.Settings.UseActorArt.Name',
		hint: 'TokenStackPicker.Settings.UseActorArt.Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});
	game.settings.register('token-stack-picker', 'gridSize', {
		name: 'TokenStackPicker.Settings.GridSize.Name',
		hint: 'TokenStackPicker.Settings.GridSize.Hint',
		scope: 'client',
		config: true,
		type: new foundry.data.fields.NumberField({ required: true, nullable: false, integer: true, min: 50, max: 200, step: 10, initial: 100 })
	});
	game.settings.register('token-stack-picker', 'gridColumns', {
		name: 'TokenStackPicker.Settings.GridColumns.Name',
		hint: 'TokenStackPicker.Settings.GridColumns.Hint',
		scope: 'client',
		config: true,
		type: new foundry.data.fields.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 6, step: 1, initial: 3 })
	});
	game.settings.register('token-stack-picker', 'targetColor', {
		name: 'TokenStackPicker.Settings.TargetColor.Name',
		hint: 'TokenStackPicker.Settings.TargetColor.Hint',
		scope: 'client',
		config: true,
		type: new foundry.data.fields.ColorField({ required: true, nullable: false, initial: '#33BBEE' })
	});
	game.settings.register('token-stack-picker', 'controlColor', {
		name: 'TokenStackPicker.Settings.ControlColor.Name',
		hint: 'TokenStackPicker.Settings.ControlColor.Hint',
		scope: 'client',
		config: true,
		type: new foundry.data.fields.ColorField({ required: true, nullable: false, initial: '#EE7733' })
	});
	game.keybindings.register('token-stack-picker', 'open', {
		name: 'TokenStackPicker.Keybindings.Open.Name',
		hint: 'TokenStackPicker.Keybindings.Open.Hint',
		editable: [{ key: 'KeyG' }],
		reservedModifiers: ['Shift', 'Alt'],
		onDown: ({ isShift, isAlt }) => {
			const isPickerOpen = foundry.applications.instances.get('token-stack-picker')?.rendered;
			const targetMode = isPickerOpen ? undefined : isShift ? 'all' : isAlt ? 'none' : undefined;
			TokenStackPicker.open(undefined, { targetMode });
			return true;
		}
	});
	game.modules.get('token-stack-picker').api = {
		open: (canvasPoint, options) => TokenStackPicker.open(canvasPoint, options)
	};
});