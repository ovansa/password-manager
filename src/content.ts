import { FormField, LoginForm, Message } from './types';

class ContentScript {
	private observer: MutationObserver;
	private loginForm: LoginForm | null = null;
	private isInjected = false;
	private browser: any;

	constructor() {
		this.browser = (globalThis as any).browser || (globalThis as any).chrome;
		this.observer = new MutationObserver(() => this.detectLoginForms());
		this.initialize();
	}

	private initialize(): void {
		// Listen for messages from background script
		this.browser.runtime.onMessage.addListener(
			(message, sender, sendResponse) => {
				this.handleMessage(message).then(sendResponse);
				return true;
			}
		);

		// Start observing DOM changes
		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		// Initial detection
		this.detectLoginForms();
	}

	private async handleMessage(message: any): Promise<any> {
		switch (message.type) {
			case 'CHECK_LOGIN_FORM':
				return { hasLoginForm: this.loginForm !== null };

			case 'AUTOFILL_FORM':
				return this.autofillForm(message.data.username, message.data.password);

			case 'INSERT_GENERATED_PASSWORD':
				return this.insertGeneratedPassword(message.data.password);

			case 'DETECT_FORMS':
				this.detectLoginForms();
				return { success: true };

			default:
				return { error: 'Unknown message type' };
		}
	}

	private detectLoginForms(): void {
		const forms = document.querySelectorAll('form');

		for (const form of forms) {
			const loginForm = this.analyzeForm(form);
			if (loginForm) {
				this.loginForm = loginForm;
				this.injectPasswordManagerInterface(form);
				break;
			}
		}

		// Also check for password fields outside forms
		if (!this.loginForm) {
			const passwordFields = document.querySelectorAll(
				'input[type="password"]'
			);
			if (passwordFields.length > 0) {
				this.detectPasswordFieldsOnly();
			}
		}
	}

	private analyzeForm(form: HTMLFormElement): LoginForm | null {
		const inputs = form.querySelectorAll('input');
		let usernameField: FormField | undefined;
		let passwordField: FormField | undefined;

		for (const input of inputs) {
			if (input.type === 'email' || this.isUsernameField(input)) {
				usernameField = {
					element: input,
					type: input.type === 'email' ? 'email' : 'username',
					value: input.value,
				};
			} else if (input.type === 'password') {
				passwordField = {
					element: input,
					type: 'password',
					value: input.value,
				};
			}
		}

		if (passwordField && (usernameField || this.isLoginForm(form))) {
			const submitButton = form.querySelector(
				'button[type="submit"], input[type="submit"]'
			) as HTMLElement;

			return {
				url: window.location.href,
				usernameField,
				passwordField,
				submitButton,
			};
		}

		return null;
	}

	private isUsernameField(input: HTMLInputElement): boolean {
		const name = input.name.toLowerCase();
		const id = input.id.toLowerCase();
		const placeholder = input.placeholder?.toLowerCase() || '';

		const usernameKeywords = ['username', 'user', 'login', 'email', 'account'];

		return usernameKeywords.some(
			(keyword) =>
				name.includes(keyword) ||
				id.includes(keyword) ||
				placeholder.includes(keyword)
		);
	}

	private isLoginForm(form: HTMLFormElement): boolean {
		const action = form.action?.toLowerCase() || '';
		const method = form.method?.toLowerCase() || '';

		const loginKeywords = ['login', 'signin', 'auth', 'authenticate'];

		return (
			loginKeywords.some((keyword) => action.includes(keyword)) ||
			method === 'post'
		);
	}

	private detectPasswordFieldsOnly(): void {
		const passwordFields = document.querySelectorAll('input[type="password"]');

		for (const passwordField of passwordFields) {
			const container =
				passwordField.closest('div, form') || passwordField.parentElement;
			if (container) {
				const usernameField = this.findNearbyUsernameField(passwordField);

				if (usernameField || this.isLikelyLoginContext(container)) {
					this.loginForm = {
						url: window.location.href,
						usernameField: usernameField
							? {
									element: usernameField,
									type: usernameField.type === 'email' ? 'email' : 'username',
									value: usernameField.value,
							  }
							: undefined,
						passwordField: {
							element: passwordField as HTMLInputElement,
							type: 'password',
							value: passwordField.value,
						},
					};

					this.injectPasswordManagerInterface(container);
					break;
				}
			}
		}
	}

	private findNearbyUsernameField(
		passwordField: Element
	): HTMLInputElement | null {
		const container =
			passwordField.closest('div, form') || passwordField.parentElement;
		if (!container) return null;

		const inputs = container.querySelectorAll(
			'input[type="text"], input[type="email"]'
		);

		for (const input of inputs) {
			if (this.isUsernameField(input as HTMLInputElement)) {
				return input as HTMLInputElement;
			}
		}

		return null;
	}

	private isLikelyLoginContext(container: Element): boolean {
		const text = container.textContent?.toLowerCase() || '';
		const className = container.className?.toLowerCase() || '';

		const loginKeywords = ['login', 'signin', 'sign in', 'password', 'auth'];

		return loginKeywords.some(
			(keyword) => text.includes(keyword) || className.includes(keyword)
		);
	}

	private injectPasswordManagerInterface(container: Element): void {
		if (this.isInjected) return;

		const passwordField = this.loginForm?.passwordField?.element;
		if (!passwordField) return;

		// Create the password manager icon
		const icon = document.createElement('div');
		icon.id = 'password-manager-icon';
		icon.innerHTML = '🔑';
		icon.style.cssText = `
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      cursor: pointer;
      z-index: 10000;
      font-size: 16px;
      color: #666;
      user-select: none;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      background: #f0f0f0;
      border: 1px solid #ccc;
    `;

		// Position the password field relatively
		const passwordFieldStyle = getComputedStyle(passwordField);
		if (passwordFieldStyle.position === 'static') {
			passwordField.style.position = 'relative';
		}

		// Add padding to avoid overlap
		passwordField.style.paddingRight = '35px';

		// Insert the icon
		passwordField.parentElement?.insertBefore(icon, passwordField.nextSibling);

		// Add click handler
		icon.addEventListener('click', () => {
			this.showPasswordList();
		});

		// Add hover effects
		icon.addEventListener('mouseenter', () => {
			icon.style.backgroundColor = '#e0e0e0';
		});

		icon.addEventListener('mouseleave', () => {
			icon.style.backgroundColor = '#f0f0f0';
		});

		this.isInjected = true;
	}

	private async showPasswordList(): Promise<void> {
		try {
			const response = await this.browser.runtime.sendMessage({
				type: 'GET_ENTRIES',
				data: { url: window.location.href },
			});

			if (response.error) {
				this.showNotification(
					'Vault is locked. Please unlock it first.',
					'error'
				);
				return;
			}

			this.createPasswordDropdown(response);
		} catch (error) {
			this.showNotification('Error loading passwords', 'error');
		}
	}

	private createPasswordDropdown(entries: any[]): void {
		// Remove existing dropdown
		const existingDropdown = document.getElementById(
			'password-manager-dropdown'
		);
		if (existingDropdown) {
			existingDropdown.remove();
		}

		if (entries.length === 0) {
			this.showNotification('No passwords found for this site', 'info');
			return;
		}

		const dropdown = document.createElement('div');
		dropdown.id = 'password-manager-dropdown';
		dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 10001;
      min-width: 200px;
      max-height: 300px;
      overflow-y: auto;
    `;

		entries.forEach((entry) => {
			const item = document.createElement('div');
			item.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

			item.innerHTML = `
        <div>
          <div style="font-weight: 500;">${this.escapeHtml(entry.title)}</div>
          <div style="font-size: 12px; color: #666;">${this.escapeHtml(
						entry.username
					)}</div>
        </div>
        <div style="font-size: 12px; color: #999;">Fill</div>
      `;

			item.addEventListener('click', () => {
				this.autofillForm(entry.username, entry.password);
				dropdown.remove();
			});

			item.addEventListener('mouseenter', () => {
				item.style.backgroundColor = '#f5f5f5';
			});

			item.addEventListener('mouseleave', () => {
				item.style.backgroundColor = 'white';
			});

			dropdown.appendChild(item);
		});

		// Position relative to the password field
		const passwordField = this.loginForm?.passwordField?.element;
		if (passwordField) {
			const rect = passwordField.getBoundingClientRect();
			dropdown.style.position = 'fixed';
			dropdown.style.top = `${rect.bottom + 5}px`;
			dropdown.style.right = `${window.innerWidth - rect.right}px`;

			document.body.appendChild(dropdown);

			// Close dropdown when clicking outside
			const closeDropdown = (event: MouseEvent) => {
				if (!dropdown.contains(event.target as Node)) {
					dropdown.remove();
					document.removeEventListener('click', closeDropdown);
				}
			};

			setTimeout(() => {
				document.addEventListener('click', closeDropdown);
			}, 100);
		}
	}

	private async autofillForm(
		username: string,
		password: string
	): Promise<{ success: boolean }> {
		if (!this.loginForm) {
			return { success: false };
		}

		// Fill username field
		if (this.loginForm.usernameField) {
			this.fillField(this.loginForm.usernameField.element, username);
		}

		// Fill password field
		this.fillField(this.loginForm.passwordField.element, password);

		this.showNotification('Form filled successfully', 'success');
		return { success: true };
	}

	private fillField(field: HTMLInputElement, value: string): void {
		// Clear existing value
		field.value = '';

		// Set new value
		field.value = value;

		// Dispatch events to trigger any listeners
		const events = ['input', 'change', 'keyup'];
		events.forEach((eventType) => {
			const event = new Event(eventType, { bubbles: true });
			field.dispatchEvent(event);
		});
	}

	private insertGeneratedPassword(password: string): { success: boolean } {
		const activeElement = document.activeElement as HTMLInputElement;

		if (activeElement && activeElement.type === 'password') {
			this.fillField(activeElement, password);
			this.showNotification('Password generated and inserted', 'success');
			return { success: true };
		}

		if (this.loginForm?.passwordField) {
			this.fillField(this.loginForm.passwordField.element, password);
			this.showNotification('Password generated and inserted', 'success');
			return { success: true };
		}

		return { success: false };
	}

	private showNotification(
		message: string,
		type: 'success' | 'error' | 'info'
	): void {
		const notification = document.createElement('div');
		notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${
				type === 'success'
					? '#4CAF50'
					: type === 'error'
					? '#f44336'
					: '#2196F3'
			};
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      z-index: 10002;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      max-width: 300px;
    `;

		notification.textContent = message;
		document.body.appendChild(notification);

		setTimeout(() => {
			notification.remove();
		}, 3000);
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
}

// Initialize the content script
new ContentScript();
