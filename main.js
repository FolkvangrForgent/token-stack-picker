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

	static async open(mousePosition = canvas.mousePosition) {
		if (!canvas.ready || !mousePosition) return;
		await foundry.applications.instances.get('token-stack-picker')?.close({ animate: false });
		const tokenIdentifiers = canvas.tokens.placeables
			.reverse()
			.filter((token) => token.isVisible && token.bounds.contains(mousePosition.x, mousePosition.y))
			.map((token) => token.id);
		if (!tokenIdentifiers.length) return;
		const globalPosition = canvas.stage.toGlobal(mousePosition);
		const { colorScheme, uiScale } = game.settings.get('core', 'uiConfig');
		const windowCursorOffset = (GRID_PAD_PX + game.settings.get('token-stack-picker', 'portraitSize') / 2) * uiScale;
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
			if (!tokenObject) continue;
			const portraitElement = document.createElement('div');
			portraitElement.className = 'portrait';
			portraitElement.dataset.tokenIdentifier = tokenIdentifier;
			portraitElement.classList.toggle('targeted', tokenObject.isTargeted);
			portraitElement.classList.toggle('obscured', !(game.user.isGM || !tokenObject.detectionFilter));
			if (game.user.isGM || (!tokenObject.detectionFilter && tokenObject.document.playersCanSeeName)) {
				portraitElement.dataset.tooltip = tokenObject.document.name;
			}
			const mediaSource = (game.settings.get('token-stack-picker', 'useActorArt') && tokenObject.actor?.img) || tokenObject.document.texture.src;
			const isVideoSource = foundry.helpers.media.VideoHelper.hasVideoExtension(mediaSource);
			const mediaElement = document.createElement(isVideoSource ? 'video' : 'img');
			if (isVideoSource) Object.assign(mediaElement, { autoplay: true, loop: true, muted: true });
			mediaElement.src = mediaSource;
			portraitElement.append(mediaElement);
			this.#renderPips(portraitElement, tokenObject);
			gridElement.append(portraitElement);
		}
		return gridElement;
	}

	_replaceHTML(renderedGridElement, contentElement) {
		contentElement.replaceChildren(renderedGridElement);
	}

	async _onFirstRender(renderContext, renderOptions) {
		await super._onFirstRender(renderContext, renderOptions);
		this.element.style.setProperty('--target', String(game.settings.get('token-stack-picker', 'targetColor')));
		this.element.style.setProperty('--size', `${game.settings.get('token-stack-picker', 'portraitSize')}px`);
		this.element.style.setProperty('--columns', game.settings.get('token-stack-picker', 'gridColumns'));
		this.element.style.setProperty('--gap', `${GRID_GAP_PX}px`);
		this.element.style.setProperty('--pad', `${GRID_PAD_PX}px`);
		const { signal } = this.#listenerAbortController;
		this.element.addEventListener('click', this.#onClick, { signal });
		this.element.addEventListener('contextmenu', this.#onContextMenu, { signal });
		this.element.addEventListener('pointerleave', this.#dismiss, { signal });
		document.addEventListener('pointermove', this.#onPointerOutside, { capture: true, signal });
		document.addEventListener('pointerdown', this.#onPointerOutside, { capture: true, signal });
		window.addEventListener('blur', this.#dismiss, { signal });
		window.addEventListener('keydown', this.#onKeyDown, { capture: true, signal });
		Hooks.on('targetToken', this.#onTargetToken);
		Hooks.on('deleteToken', this.#onDeleteToken);
		Hooks.on('canvasPan', this.#dismiss);
		Hooks.on('canvasTearDown', this.#dismiss);
	}

	_onClose(closeOptions) {
		super._onClose(closeOptions);
		this.#listenerAbortController.abort();
		Hooks.off('targetToken', this.#onTargetToken);
		Hooks.off('deleteToken', this.#onDeleteToken);
		Hooks.off('canvasPan', this.#dismiss);
		Hooks.off('canvasTearDown', this.#dismiss);
	}

	#isTargetKey(keyboardEvent) {
		const pressedModifiers = new Set();
		if (keyboardEvent.shiftKey) pressedModifiers.add('Shift');
		if (keyboardEvent.altKey) pressedModifiers.add('Alt');
		if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) pressedModifiers.add('Control');
		const coreTargetBindings = game.keybindings.get('core', 'target');
		const activeBindings = coreTargetBindings.length ? coreTargetBindings : game.keybindings.get('token-stack-picker', 'open');
		return activeBindings.some(({ key: boundKey, modifiers: boundModifiers }) =>
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
		if (!this.#isTargetKey(keyboardEvent)) return;
		const hoveredPortraitElement = this.element.querySelector('.portrait:hover');
		const hoveredToken = canvas.tokens.get(hoveredPortraitElement?.dataset.tokenIdentifier);
		if (!hoveredToken) return;
		keyboardEvent.preventDefault();
		keyboardEvent.stopImmediatePropagation();
		if (!keyboardEvent.repeat) hoveredToken.setTarget(!hoveredToken.isTargeted, { releaseOthers: false });
	};

	#onTargetToken = (targetingUser, token, isTargeted) => {
		const portraitElement = this.element.querySelector(`[data-token-identifier="${token.id}"]`);
		if (!portraitElement) return;
		if (targetingUser === game.user) portraitElement.classList.toggle('targeted', isTargeted);
		else this.#renderPips(portraitElement, token);
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
		if (!token.actor) return false;
		// Sensed-but-unseen tokens are shown as silhouettes, so the sheet must not reveal what they are
		if (!game.user.isGM && token.detectionFilter) return false;
		return token.actor.testUserPermission(game.user, 'LIMITED');
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
		token.setTarget(!token.isTargeted, { releaseOthers: false });
	};

	#onContextMenu = (mouseEvent) => {
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
	game.settings.register('token-stack-picker', 'portraitSize', {
		name: 'TokenStackPicker.Settings.PortraitSize.Name',
		hint: 'TokenStackPicker.Settings.PortraitSize.Hint',
		scope: 'client',
		config: true,
		type: new foundry.data.fields.NumberField({
			required: true, nullable: false, integer: true, min: 50, max: 200, step: 10, initial: 100
		})
	});
	game.settings.register('token-stack-picker', 'gridColumns', {
		name: 'TokenStackPicker.Settings.GridColumns.Name',
		hint: 'TokenStackPicker.Settings.GridColumns.Hint',
		scope: 'client',
		config: true,
		type: new foundry.data.fields.NumberField({
			required: true, nullable: false, integer: true, min: 1, max: 6, step: 1, initial: 3
		})
	});
	game.settings.register('token-stack-picker', 'targetColor', {
		name: 'TokenStackPicker.Settings.TargetColor.Name',
		hint: 'TokenStackPicker.Settings.TargetColor.Hint',
		scope: 'client',
		config: true,
		type: new foundry.data.fields.ColorField({ required: true, nullable: false, initial: '#ff6400' })
	});
	game.keybindings.register('token-stack-picker', 'open', {
		name: 'TokenStackPicker.Keybindings.Open.Name',
		hint: 'TokenStackPicker.Keybindings.Open.Hint',
		editable: [{ key: 'KeyG' }],
		onDown: () => {
			TokenStackPicker.open();
			return true;
		}
	});
	game.modules.get('token-stack-picker').api = { open: canvasPoint => TokenStackPicker.open(canvasPoint) };
});