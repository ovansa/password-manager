import { Message, PasswordEntry, UserSettings } from './types';

interface PopupState {
	isLocked: boolean;
	currentTab: string;
	passwords: PasswordEntry[];
	filteredPasswords: PasswordEntry[];
	editingPassword: PasswordEntry | null;
	generatedPassword: string;
	settings: UserSettings;
}

class PopupManager {
	private state: PopupState = {
		isLocked: true,
		currentTab: 'passwords',
		passwords: [],
		filteredPasswords: [],
		editingPassword: null,
		generatedPassword: '',
		settings: {
			lockTimeout: 15,
			autoLockEnabled: true,
			passwordGenerator: {
				length: 16,
				includeUppercase: true,
				includeLowercase: true,
				includeNumbers: true,
				includeSymbols: true,
				excludeSimilar: true,
			},
		},
	};

	private elements: { [key: string]: HTMLElement } = {};
	private browser: any;

	constructor() {
		this.browser = (globalThis as any).browser || (globalThis as any).chrome;
		this.initializeElements();
		this.initializeEventListeners();
		this.checkLockStatus();
	}

	private initializeElements(): void {
		// Get all required DOM elements
		this.elements.unlockScreen = document.getElementById('unlockScreen')!;
		this.elements.mainInterface = document.getElementById('mainInterface')!;
		this.elements.statusDot = document.getElementById('statusDot')!;
		this.elements.statusText = document.getElementById('statusText')!;
		this.elements.masterPassword = document.getElementById('masterPassword')!;
		this.elements.unlockButton = document.getElementById('unlockButton')!;
		this.elements.unlockError = document.getElementById('unlockError')!;
		this.elements.searchInput = document.getElementById('searchInput')!;
		this.elements.passwordList = document.getElementById('passwordList')!;
		this.elements.emptyState = document.getElementById('emptyState')!;
		this.elements.addPasswordButton =
			document.getElementById('addPasswordButton')!;
		this.elements.lockVaultButton = document.getElementById('lockVaultButton')!;
		this.elements.generatedPassword =
			document.getElementById('generatedPassword')!;
		this.elements.strengthBar = document.getElementById('strengthBar')!;
		this.elements.generateButton = document.getElementById('generateButton')!;
		this.elements.copyPasswordButton =
			document.getElementById('copyPasswordButton')!;
		this.elements.passwordModal = document.getElementById('passwordModal')!;
		this.elements.modalTitle = document.getElementById('modalTitle')!;
		this.elements.passwordTitle = document.getElementById('passwordTitle')!;
		this.elements.passwordUrl = document.getElementById('passwordUrl')!;
		this.elements.passwordUsername =
			document.getElementById('passwordUsername')!;
		this.elements.passwordPassword =
			document.getElementById('passwordPassword')!;
		this.elements.passwordNotes = document.getElementById('passwordNotes')!;
		this.elements.savePasswordButton =
			document.getElementById('savePasswordButton')!;
		this.elements.cancelPasswordButton = document.getElementById(
			'cancelPasswordButton'
		)!;
		this.elements.exportButton = document.getElementById('exportButton')!;
		this.elements.importButton = document.getElementById('importButton')!;
		this.elements.importFile = document.getElementById('importFile')!;
		this.elements.lockTimeout = document.getElementById('lockTimeout')!;
		this.elements.autoLockEnabled = document.getElementById('autoLockEnabled')!;
		this.elements.passwordLength = document.getElementById('passwordLength')!;
		this.elements.includeUppercase =
			document.getElementById('includeUppercase')!;
		this.elements.includeLowercase =
			document.getElementById('includeLowercase')!;
		this.elements.includeNumbers = document.getElementById('includeNumbers')!;
		this.elements.includeSymbols = document.getElementById('includeSymbols')!;
	}

	private initializeEventListeners(): void {
		// Unlock functionality
		this.elements.unlockButton.addEventListener('click', () =>
			this.unlockVault()
		);
		this.elements.masterPassword.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') this.unlockVault();
		});

		// Tab navigation
		document.querySelectorAll('.tab').forEach((tab) => {
			tab.addEventListener('click', (e) => {
				const target = e.target as HTMLElement;
				const tabName = target.dataset.tab;
				if (tabName) this.switchTab(tabName);
			});
		});

		// Search functionality
		this.elements.searchInput.addEventListener('input', (e) => {
			const target = e.target as HTMLInputElement;
			this.searchPasswords(target.value);
		});

		// Password management
		this.elements.addPasswordButton.addEventListener('click', () =>
			this.showPasswordModal()
		);
		this.elements.lockVaultButton.addEventListener('click', () =>
			this.lockVault()
		);
		this.elements.savePasswordButton.addEventListener('click', () =>
			this.savePassword()
		);
		this.elements.cancelPasswordButton.addEventListener('click', () =>
			this.hidePasswordModal()
		);

		// Password generator
		this.elements.generateButton.addEventListener('click', () =>
			this.generatePassword()
		);
		this.elements.copyPasswordButton.addEventListener('click', () =>
			this.copyGeneratedPassword()
		);

		// Generator options
		[
			'passwordLength',
			'includeUppercase',
			'includeLowercase',
			'includeNumbers',
			'includeSymbols',
		].forEach((id) => {
			const element = document.getElementById(id);
			if (element) {
				element.addEventListener('change', () =>
					this.updateGeneratorSettings()
				);
			}
		});

		// Settings
		this.elements.lockTimeout.addEventListener('change', () =>
			this.updateSettings()
		);
		this.elements.autoLockEnabled.addEventListener('change', () =>
			this.updateSettings()
		);

		// Data management
		this.elements.exportButton.addEventListener('click', () =>
			this.exportData()
		);
		this.elements.importButton.addEventListener('click', () =>
			this.elements.importFile.click()
		);
		this.elements.importFile.addEventListener('change', (e) =>
			this.importData(e)
		);

		// Modal close on background click
		this.elements.passwordModal.addEventListener('click', (e) => {
			if (e.target === this.elements.passwordModal) {
				this.hidePasswordModal();
			}
		});
	}

	private async checkLockStatus(): Promise<void> {
		try {
			const response = await this.sendMessage({ type: 'CHECK_LOCK_STATUS' });
			console.log('[PasswordManager: checkLockStatus]', response);
			this.state.isLocked = response.isLocked !== false;
			this.updateUI();
		} catch (error) {
			console.error('Error checking lock status:', error);
			this.state.isLocked = true;
			this.updateUI();
		}
	}

	private async unlockVault(): Promise<void> {
		const masterPassword = (this.elements.masterPassword as HTMLInputElement)
			.value;

		if (!masterPassword) {
			this.showError('Please enter your master password');
			return;
		}

		try {
			this.setLoading(true);
			const response = await this.sendMessage({
				type: 'UNLOCK_VAULT',
				data: { masterPassword },
			});

			if (response.success) {
				this.state.isLocked = false;
				this.hideError();
				await this.loadPasswords();
				this.updateUI();
			} else {
				this.showError(response.error || 'Failed to unlock vault');
			}
		} catch (error) {
			this.showError('Error unlocking vault');
		} finally {
			this.setLoading(false);
		}
	}

	private async lockVault(): Promise<void> {
		try {
			await this.sendMessage({ type: 'LOCK_VAULT' });
			this.state.isLocked = true;
			this.state.passwords = [];
			this.state.filteredPasswords = [];
			(this.elements.masterPassword as HTMLInputElement).value = '';
			this.updateUI();
		} catch (error) {
			console.error('Error locking vault:', error);
		}
	}

	private async loadPasswords(): Promise<void> {
		try {
			const passwords = await this.sendMessage({ type: 'GET_ENTRIES' });
			this.state.passwords = passwords || [];
			this.state.filteredPasswords = [...this.state.passwords];
			this.renderPasswordList();
		} catch (error) {
			console.error('Error loading passwords:', error);
			this.state.passwords = [];
			this.state.filteredPasswords = [];
			this.renderPasswordList();
		}
	}

	private switchTab(tabName: string): void {
		this.state.currentTab = tabName;

		// Update tab buttons
		document.querySelectorAll('.tab').forEach((tab) => {
			tab.classList.remove('active');
		});
		document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

		// Show/hide tab content
		document.querySelectorAll('.tab-content').forEach((content) => {
			content.classList.add('hidden');
		});
		document.getElementById(`${tabName}Tab`)?.classList.remove('hidden');

		// Load tab-specific data
		if (tabName === 'passwords' && !this.state.isLocked) {
			this.loadPasswords();
		}
	}

	private searchPasswords(query: string): void {
		if (!query.trim()) {
			this.state.filteredPasswords = [...this.state.passwords];
		} else {
			const lowerQuery = query.toLowerCase();
			this.state.filteredPasswords = this.state.passwords.filter(
				(password) =>
					password.title.toLowerCase().includes(lowerQuery) ||
					password.username.toLowerCase().includes(lowerQuery) ||
					password.url.toLowerCase().includes(lowerQuery)
			);
		}
		this.renderPasswordList();
	}

	private renderPasswordList(): void {
		const passwordList = this.elements.passwordList;
		const emptyState = this.elements.emptyState;

		if (this.state.filteredPasswords.length === 0) {
			passwordList.innerHTML = '';
			emptyState.classList.remove('hidden');
			return;
		}

		emptyState.classList.add('hidden');
		passwordList.innerHTML = this.state.filteredPasswords
			.map((password) => this.createPasswordItem(password))
			.join('');

		// Add event listeners to password items
		passwordList.querySelectorAll('.password-item').forEach((item) => {
			const passwordId = item.getAttribute('data-id');
			if (passwordId) {
				item.addEventListener('click', () => this.copyPassword(passwordId));

				const editBtn = item.querySelector('.edit-btn');
				const deleteBtn = item.querySelector('.delete-btn');

				editBtn?.addEventListener('click', (e) => {
					e.stopPropagation();
					this.editPassword(passwordId);
				});

				deleteBtn?.addEventListener('click', (e) => {
					e.stopPropagation();
					this.deletePassword(passwordId);
				});
			}
		});
	}

	private createPasswordItem(password: PasswordEntry): string {
		const favicon = this.getFavicon(password.url);
		const timeAgo = this.getTimeAgo(password.lastUsed);

		return `
			<div class="password-item" data-id="${password.id}">
				<div class="password-item-icon">${favicon}</div>
				<div class="password-item-content">
					<div class="password-item-title">${this.escapeHtml(password.title)}</div>
					<div class="password-item-username">${this.escapeHtml(password.username)}</div>
				</div>
				<div class="password-item-actions">
					<button class="btn btn-secondary edit-btn" style="font-size: 10px; padding: 4px 8px;">Edit</button>
					<button class="btn btn-danger delete-btn" style="font-size: 10px; padding: 4px 8px;">Delete</button>
				</div>
			</div>
		`;
	}

	private getFavicon(url: string): string {
		try {
			const domain = new URL(url).hostname;
			return domain.charAt(0).toUpperCase();
		} catch {
			return '🔑';
		}
	}

	private getTimeAgo(timestamp: number): string {
		if (!timestamp) return 'Never';
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return 'Just now';
	}

	private async copyPassword(passwordId: string): Promise<void> {
		try {
			const password = this.state.passwords.find((p) => p.id === passwordId);
			if (password) {
				await navigator.clipboard.writeText(password.password);
				this.showSuccess('Password copied to clipboard');
			}
		} catch (error) {
			console.error('Error copying password:', error);
			this.showError('Failed to copy password');
		}
	}

	private editPassword(passwordId: string): void {
		const password = this.state.passwords.find((p) => p.id === passwordId);
		if (password) {
			this.state.editingPassword = password;
			this.showPasswordModal(password);
		}
	}

	private async deletePassword(passwordId: string): Promise<void> {
		if (confirm('Are you sure you want to delete this password?')) {
			try {
				await this.sendMessage({
					type: 'DELETE_ENTRY',
					data: { id: passwordId },
				});
				await this.loadPasswords();
				this.showSuccess('Password deleted successfully');
			} catch (error) {
				console.error('Error deleting password:', error);
				this.showError('Failed to delete password');
			}
		}
	}

	private showPasswordModal(password?: PasswordEntry): void {
		this.elements.modalTitle.textContent = password
			? 'Edit Password'
			: 'Add New Password';

		if (password) {
			(this.elements.passwordTitle as HTMLInputElement).value = password.title;
			(this.elements.passwordUrl as HTMLInputElement).value = password.url;
			(this.elements.passwordUsername as HTMLInputElement).value =
				password.username;
			(this.elements.passwordPassword as HTMLInputElement).value =
				password.password;
			(this.elements.passwordNotes as HTMLInputElement).value =
				password.notes || '';
		} else {
			// Clear form
			(this.elements.passwordTitle as HTMLInputElement).value = '';
			(this.elements.passwordUrl as HTMLInputElement).value = '';
			(this.elements.passwordUsername as HTMLInputElement).value = '';
			(this.elements.passwordPassword as HTMLInputElement).value = '';
			(this.elements.passwordNotes as HTMLInputElement).value = '';
		}

		this.elements.passwordModal.classList.remove('hidden');
	}

	private hidePasswordModal(): void {
		this.elements.passwordModal.classList.add('hidden');
		this.state.editingPassword = null;
	}

	private async savePassword(): Promise<void> {
		const title = (
			this.elements.passwordTitle as HTMLInputElement
		).value.trim();
		const url = (this.elements.passwordUrl as HTMLInputElement).value.trim();
		const username = (
			this.elements.passwordUsername as HTMLInputElement
		).value.trim();
		const password = (this.elements.passwordPassword as HTMLInputElement).value;
		const notes = (
			this.elements.passwordNotes as HTMLInputElement
		).value.trim();

		if (!title || !username || !password) {
			this.showError('Please fill in all required fields');
			return;
		}

		try {
			const passwordEntry: PasswordEntry = {
				id: this.state.editingPassword?.id || this.generateId(),
				title,
				url,
				username,
				password,
				notes,
				createdAt: this.state.editingPassword?.createdAt || Date.now(),
				lastUsed: this.state.editingPassword?.lastUsed || 0,
			};

			await this.sendMessage({
				type: 'SAVE_ENTRY',
				data: { entry: passwordEntry },
			});

			this.hidePasswordModal();
			await this.loadPasswords();
			this.showSuccess(
				this.state.editingPassword
					? 'Password updated successfully'
					: 'Password saved successfully'
			);
		} catch (error) {
			console.error('Error saving password:', error);
			this.showError('Failed to save password');
		}
	}

	private async generatePassword(): Promise<void> {
		try {
			const settings = this.getGeneratorSettings();
			const password = await this.sendMessage({
				type: 'GENERATE_PASSWORD',
				data: { settings },
			});

			this.state.generatedPassword = password;
			this.elements.generatedPassword.textContent = password;
			this.updatePasswordStrength(password);
		} catch (error) {
			console.error('Error generating password:', error);
			this.showError('Failed to generate password');
		}
	}

	private getGeneratorSettings() {
		return {
			length: parseInt(
				(this.elements.passwordLength as HTMLInputElement).value
			),
			includeUppercase: (this.elements.includeUppercase as HTMLInputElement)
				.checked,
			includeLowercase: (this.elements.includeLowercase as HTMLInputElement)
				.checked,
			includeNumbers: (this.elements.includeNumbers as HTMLInputElement)
				.checked,
			includeSymbols: (this.elements.includeSymbols as HTMLInputElement)
				.checked,
			excludeSimilar: true,
		};
	}

	private updatePasswordStrength(password: string): void {
		const strength = this.calculatePasswordStrength(password);
		const strengthBar = this.elements.strengthBar;

		// Remove existing strength classes
		strengthBar.className = 'strength-bar';

		// Add new strength class and set width
		if (strength <= 20) {
			strengthBar.classList.add('strength-very-weak');
			strengthBar.style.width = '20%';
		} else if (strength <= 40) {
			strengthBar.classList.add('strength-weak');
			strengthBar.style.width = '40%';
		} else if (strength <= 60) {
			strengthBar.classList.add('strength-fair');
			strengthBar.style.width = '60%';
		} else if (strength <= 80) {
			strengthBar.classList.add('strength-good');
			strengthBar.style.width = '80%';
		} else {
			strengthBar.classList.add('strength-strong');
			strengthBar.style.width = '100%';
		}
	}

	private calculatePasswordStrength(password: string): number {
		let score = 0;

		// Length score
		if (password.length >= 8) score += 20;
		if (password.length >= 12) score += 10;
		if (password.length >= 16) score += 10;

		// Character variety
		if (/[a-z]/.test(password)) score += 15;
		if (/[A-Z]/.test(password)) score += 15;
		if (/[0-9]/.test(password)) score += 15;
		if (/[^a-zA-Z0-9]/.test(password)) score += 15;

		return Math.min(score, 100);
	}

	private async copyGeneratedPassword(): Promise<void> {
		if (!this.state.generatedPassword) {
			this.showError('No password generated yet');
			return;
		}

		try {
			await navigator.clipboard.writeText(this.state.generatedPassword);
			this.showSuccess('Password copied to clipboard');
		} catch (error) {
			console.error('Error copying password:', error);
			this.showError('Failed to copy password');
		}
	}

	private updateGeneratorSettings(): void {
		// Update the internal settings
		this.state.settings.passwordGenerator = this.getGeneratorSettings();

		// Auto-generate new password if current one exists
		if (this.state.generatedPassword) {
			this.generatePassword();
		}
	}

	private updateSettings(): void {
		const lockTimeout = parseInt(
			(this.elements.lockTimeout as HTMLSelectElement).value
		);
		const autoLockEnabled = (this.elements.autoLockEnabled as HTMLInputElement)
			.checked;

		this.state.settings.lockTimeout = lockTimeout;
		this.state.settings.autoLockEnabled = autoLockEnabled;

		// Save settings to background script
		this.sendMessage({
			type: 'UPDATE_SETTINGS',
			data: { settings: this.state.settings },
		});
	}

	private async exportData(): Promise<void> {
		try {
			const data = await this.sendMessage({ type: 'EXPORT_DATA' });
			const blob = new Blob([data], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `securevault-export-${
				new Date().toISOString().split('T')[0]
			}.json`;
			a.click();
			URL.revokeObjectURL(url);
			this.showSuccess('Data exported successfully');
		} catch (error) {
			console.error('Error exporting data:', error);
			this.showError('Failed to export data');
		}
	}

	private async importData(event: Event): Promise<void> {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;

		try {
			const text = await file.text();
			await this.sendMessage({
				type: 'IMPORT_DATA',
				data: { importData: text },
			});

			await this.loadPasswords();
			this.showSuccess('Data imported successfully');
		} catch (error) {
			console.error('Error importing data:', error);
			this.showError('Failed to import data');
		}
	}

	private updateUI(): void {
		if (this.state.isLocked) {
			this.elements.unlockScreen.classList.remove('hidden');
			this.elements.mainInterface.classList.add('hidden');
			this.elements.statusDot.classList.add('locked');
			this.elements.statusText.textContent = 'Locked';
		} else {
			this.elements.unlockScreen.classList.add('hidden');
			this.elements.mainInterface.classList.remove('hidden');
			this.elements.statusDot.classList.remove('locked');
			this.elements.statusText.textContent = 'Unlocked';
		}
	}

	private setLoading(loading: boolean): void {
		const button = this.elements.unlockButton as HTMLButtonElement;
		button.disabled = loading;
		button.textContent = loading ? 'Unlocking...' : 'Unlock Vault';
	}

	private showError(message: string): void {
		this.elements.unlockError.textContent = message;
		this.elements.unlockError.classList.remove('hidden');
		setTimeout(() => this.hideError(), 5000);
	}

	private hideError(): void {
		this.elements.unlockError.classList.add('hidden');
	}

	private showSuccess(message: string): void {
		// Create a temporary success notification
		const notification = document.createElement('div');
		notification.className = 'success-message';
		notification.textContent = message;
		notification.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			background: #28a745;
			color: white;
			padding: 12px 16px;
			border-radius: 4px;
			z-index: 10000;
			font-size: 14px;
		`;

		document.body.appendChild(notification);
		setTimeout(() => notification.remove(), 3000);
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	private async sendMessage(message: Message): Promise<any> {
		return new Promise((resolve, reject) => {
			this.browser.runtime.sendMessage(message, (response) => {
				if (this.browser.runtime.lastError) {
					reject(this.browser.runtime.lastError);
				} else if (response?.error) {
					reject(new Error(response.error));
				} else {
					resolve(response);
				}
			});
		});
	}
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	new PopupManager();
});
