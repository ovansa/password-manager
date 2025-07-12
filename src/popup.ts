import { Message, PasswordEntry, UserSettings } from './types';

interface PopupState {
	vaultExists: boolean;
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
		vaultExists: false,
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
		this.checkVaultStatus();
	}

	private initializeElements(): void {
		// Get all required DOM elements
		this.elements.setupScreen = document.getElementById('setupScreen')!;
		this.elements.unlockScreen = document.getElementById('unlockScreen')!;
		this.elements.mainInterface = document.getElementById('mainInterface')!;
		this.elements.statusDot = document.getElementById('statusDot')!;
		this.elements.statusText = document.getElementById('statusText')!;

		// Setup elements
		this.elements.setupPassword = document.getElementById('setupPassword')!;
		this.elements.confirmPassword = document.getElementById('confirmPassword')!;
		this.elements.setupButton = document.getElementById('setupButton')!;
		this.elements.setupError = document.getElementById('setupError')!;

		// Unlock elements
		this.elements.masterPassword = document.getElementById('masterPassword')!;
		this.elements.unlockButton = document.getElementById('unlockButton')!;
		this.elements.unlockError = document.getElementById('unlockError')!;

		// Main interface elements
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
		// Setup functionality
		this.elements.setupButton.addEventListener('click', () =>
			this.setupVault()
		);
		this.elements.setupPassword.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				this.elements.confirmPassword.focus();
			}
		});
		this.elements.confirmPassword.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') this.setupVault();
		});

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

	private async checkVaultStatus(): Promise<void> {
		try {
			const response = await this.sendMessage({ type: 'CHECK_LOCK_STATUS' });
			console.log('[PasswordManager: checkVaultStatus]', response);
			this.state.vaultExists = response.vaultExists;
			this.state.isLocked = response.isLocked !== false;

			if (response.passwords) {
				this.state.passwords = response.passwords;
				this.state.filteredPasswords = response.passwords;
			}

			if (response.settings) {
				this.state.settings = response.settings;
			}

			this.updateUI();
		} catch (error) {
			console.error('[PasswordManager: checkVaultStatus]', error);
			this.showError('Failed to check vault status');
		}
	}

	private updateUI(): void {
		// Update status indicator
		this.elements.statusDot.className = `status-dot ${
			this.state.isLocked ? 'locked' : ''
		}`;
		this.elements.statusText.textContent = this.state.isLocked
			? 'Locked'
			: 'Unlocked';

		console.log('PasswordManager: State:', this.state);

		// Show appropriate screen
		if (!this.state.vaultExists) {
			this.showScreen('setup');
		} else if (this.state.isLocked) {
			this.showScreen('unlock');
		} else {
			this.showScreen('main');
			this.loadPasswords();
			this.updateSettingsUI();
		}
	}

	private showScreen(screen: 'setup' | 'unlock' | 'main'): void {
		this.elements.setupScreen.classList.add('hidden');
		this.elements.unlockScreen.classList.add('hidden');
		this.elements.mainInterface.classList.add('hidden');

		switch (screen) {
			case 'setup':
				this.elements.setupScreen.classList.remove('hidden');
				break;
			case 'unlock':
				this.elements.unlockScreen.classList.remove('hidden');
				break;
			case 'main':
				this.elements.mainInterface.classList.remove('hidden');
				break;
		}
	}

	private async setupVault(): Promise<void> {
		const password = (this.elements.setupPassword as HTMLInputElement).value;
		const confirmPassword = (this.elements.confirmPassword as HTMLInputElement)
			.value;

		if (!password || password.length < 8) {
			this.showSetupError('Password must be at least 8 characters long');
			return;
		}

		if (password !== confirmPassword) {
			this.showSetupError('Passwords do not match');
			return;
		}

		try {
			const response = await this.sendMessage({
				type: 'CREATE_VAULT',
				data: { masterPassword: password },
			});

			if (response.success) {
				this.state.vaultExists = true;
				this.state.isLocked = false;
				this.updateUI();
			} else {
				this.showSetupError(response.error || 'Failed to setup vault');
			}
		} catch (error) {
			console.error('[PasswordManager: setupVault]', error);
			this.showSetupError('Failed to setup vault');
		}
	}

	private async unlockVault(): Promise<void> {
		const password = (this.elements.masterPassword as HTMLInputElement).value;

		if (!password) {
			this.showUnlockError('Please enter your master password');
			return;
		}

		try {
			const response = await this.sendMessage({
				type: 'UNLOCK_VAULT',
				data: { masterPassword: password },
			});

			if (response.success) {
				this.state.isLocked = false;
				this.state.passwords = response.passwords || [];
				this.state.filteredPasswords = response.passwords || [];
				this.updateUI();
			} else {
				this.showUnlockError(response.error || 'Invalid master password');
			}
		} catch (error) {
			console.error('[PasswordManager: unlockVault]', error);
			this.showUnlockError('Failed to unlock vault');
		}
	}

	private async lockVault(): Promise<void> {
		try {
			await this.sendMessage({ type: 'LOCK_VAULT' });
			this.state.isLocked = true;
			this.updateUI();
		} catch (error) {
			console.error('[PasswordManager: lockVault]', error);
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

		// Initialize tab-specific content
		if (tabName === 'generator') {
			this.generatePassword();
		}
	}

	private searchPasswords(query: string): void {
		if (!query.trim()) {
			this.state.filteredPasswords = this.state.passwords;
		} else {
			this.state.filteredPasswords = this.state.passwords.filter(
				(password) =>
					password.title.toLowerCase().includes(query.toLowerCase()) ||
					password.username.toLowerCase().includes(query.toLowerCase()) ||
					password.url.toLowerCase().includes(query.toLowerCase())
			);
		}
		this.renderPasswordList();
	}

	private loadPasswords(): void {
		this.renderPasswordList();
	}

	private renderPasswordList(): void {
		console.log('Current asswords ', this.state.passwords);
		console.log('PasswordManager: RenderPassword: ', this.elements);
		const passwordList = this.elements.passwordList;

		const emptyState = this.elements.emptyState;
		console.log('Filtered passwords ', this.state.filteredPasswords);

		if (this.state.filteredPasswords.length === 0) {
			passwordList.innerHTML = '';
			emptyState.classList.remove('hidden');
		} else {
			emptyState.classList.add('hidden');
			passwordList.innerHTML = this.state.filteredPasswords
				.map(
					(password) => `
				<div class="password-item" data-id="${password.id}">
					<div class="password-item-icon">${this.getPasswordIcon(password.url)}</div>
					<div class="password-item-content">
						<div class="password-item-title">${password.title}</div>
						<div class="password-item-username">${password.username}</div>
					</div>
					<div class="password-item-actions">
						<button class="btn btn-primary" onclick="popupManager.copyPassword('${
							password.id
						}')">Copy</button>
						<button class="btn btn-secondary" onclick="popupManager.editPassword('${
							password.id
						}')">Edit</button>
						<button class="btn btn-danger" onclick="popupManager.deletePassword('${
							password.id
						}')">Delete</button>
					</div>
				</div>
			`
				)
				.join('');
		}
	}

	private getPasswordIcon(url: string): string {
		try {
			const domain = new URL(url).hostname;
			const icons: { [key: string]: string } = {
				'google.com': '🔍',
				'gmail.com': '📧',
				'facebook.com': '📘',
				'twitter.com': '🐦',
				'instagram.com': '📷',
				'linkedin.com': '💼',
				'github.com': '🐙',
				'microsoft.com': '🖥️',
				'apple.com': '🍎',
				'amazon.com': '📦',
				'netflix.com': '🎬',
				'spotify.com': '🎵',
			};
			return icons[domain] || '🔐';
		} catch {
			return '🔐';
		}
	}

	private showPasswordModal(password?: PasswordEntry): void {
		this.state.editingPassword = password || null;

		if (password) {
			this.elements.modalTitle.textContent = 'Edit Password';
			(this.elements.passwordTitle as HTMLInputElement).value = password.title;
			(this.elements.passwordUrl as HTMLInputElement).value = password.url;
			(this.elements.passwordUsername as HTMLInputElement).value =
				password.username;
			(this.elements.passwordPassword as HTMLInputElement).value =
				password.password;
			(this.elements.passwordNotes as HTMLInputElement).value =
				password.notes || '';
		} else {
			this.elements.modalTitle.textContent = 'Add New Password';
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
		const title = (this.elements.passwordTitle as HTMLInputElement).value;
		const url = (this.elements.passwordUrl as HTMLInputElement).value;
		const username = (this.elements.passwordUsername as HTMLInputElement).value;
		const password = (this.elements.passwordPassword as HTMLInputElement).value;
		const notes = (this.elements.passwordNotes as HTMLInputElement).value;

		if (!title || !username || !password) {
			this.showError('Please fill in all required fields');
			return;
		}

		try {
			const passwordEntry: PasswordEntry = {
				id: this.state.editingPassword?.id || Date.now().toString(),
				title,
				url,
				username,
				password,
				notes,
				createdAt:
					this.state.editingPassword?.createdAt || new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			console.log('PasswordEntry: ', passwordEntry);

			const response = await this.sendMessage({
				type: 'SAVE_ENTRY',
				data: { entry: passwordEntry },
			});

			if (response.success) {
				this.state.passwords = response.passwords;
				this.state.filteredPasswords = response.passwords;
				this.hidePasswordModal();
				this.renderPasswordList();
			} else {
				this.showError(response.error || 'Failed to save password');
			}
		} catch (error) {
			console.error('[PasswordManager: savePassword]', error);
			this.showError('Failed to save password');
		}
	}

	public async editPassword(id: string): Promise<void> {
		const password = this.state.passwords.find((p) => p.id === id);
		if (password) {
			this.showPasswordModal(password);
		}
	}

	public async deletePassword(id: string): Promise<void> {
		if (!confirm('Are you sure you want to delete this password?')) {
			return;
		}

		try {
			const response = await this.sendMessage({
				type: 'DELETE_PASSWORD',
				data: { id },
			});

			if (response.success) {
				this.state.passwords = response.passwords;
				this.state.filteredPasswords = response.passwords;
				this.renderPasswordList();
			} else {
				this.showError(response.error || 'Failed to delete password');
			}
		} catch (error) {
			console.error('[PasswordManager: deletePassword]', error);
			this.showError('Failed to delete password');
		}
	}

	public async copyPassword(id: string): Promise<void> {
		const password = this.state.passwords.find((p) => p.id === id);
		if (password) {
			try {
				await navigator.clipboard.writeText(password.password);
				this.showSuccess('Password copied to clipboard');
			} catch (error) {
				console.error('[PasswordManager: copyPassword]', error);
				this.showError('Failed to copy password');
			}
		}
	}

	private generatePassword(): void {
		const settings = this.state.settings.passwordGenerator;
		const length = parseInt(
			(this.elements.passwordLength as HTMLInputElement).value
		);

		let charset = '';
		if (settings.includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		if (settings.includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
		if (settings.includeNumbers) charset += '0123456789';
		if (settings.includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

		if (settings.excludeSimilar) {
			charset = charset.replace(/[0O1lI]/g, '');
		}

		if (!charset) {
			this.showError('Please select at least one character type');
			return;
		}

		let password = '';
		for (let i = 0; i < length; i++) {
			password += charset.charAt(Math.floor(Math.random() * charset.length));
		}

		this.state.generatedPassword = password;
		this.elements.generatedPassword.textContent = password;
		this.updatePasswordStrength(password);
	}

	private updatePasswordStrength(password: string): void {
		const strength = this.calculatePasswordStrength(password);
		const strengthBar = this.elements.strengthBar;

		strengthBar.style.width = `${strength.percentage}%`;
		strengthBar.className = `strength-bar strength-${strength.level}`;
	}

	private calculatePasswordStrength(password: string): {
		level: string;
		percentage: number;
	} {
		let score = 0;

		// Length bonus
		if (password.length >= 8) score += 1;
		if (password.length >= 12) score += 1;
		if (password.length >= 16) score += 1;

		// Character variety
		if (/[a-z]/.test(password)) score += 1;
		if (/[A-Z]/.test(password)) score += 1;
		if (/[0-9]/.test(password)) score += 1;
		if (/[^a-zA-Z0-9]/.test(password)) score += 1;

		const levels = ['very-weak', 'weak', 'fair', 'good', 'strong'];
		const level = levels[Math.min(Math.floor(score / 1.5), 4)];
		const percentage = Math.min((score / 7) * 100, 100);

		return { level, percentage };
	}

	private async copyGeneratedPassword(): Promise<void> {
		if (!this.state.generatedPassword) {
			this.showError('No password generated');
			return;
		}

		try {
			await navigator.clipboard.writeText(this.state.generatedPassword);
			this.showSuccess('Password copied to clipboard');
		} catch (error) {
			console.error('[PasswordManager: copyGeneratedPassword]', error);
			this.showError('Failed to copy password');
		}
	}

	private updateGeneratorSettings(): void {
		const settings = this.state.settings.passwordGenerator;

		settings.length = parseInt(
			(this.elements.passwordLength as HTMLInputElement).value
		);
		settings.includeUppercase = (
			this.elements.includeUppercase as HTMLInputElement
		).checked;
		settings.includeLowercase = (
			this.elements.includeLowercase as HTMLInputElement
		).checked;
		settings.includeNumbers = (
			this.elements.includeNumbers as HTMLInputElement
		).checked;
		settings.includeSymbols = (
			this.elements.includeSymbols as HTMLInputElement
		).checked;

		this.saveSettings();
	}

	private updateSettings(): void {
		this.state.settings.lockTimeout = parseInt(
			(this.elements.lockTimeout as HTMLSelectElement).value
		);
		this.state.settings.autoLockEnabled = (
			this.elements.autoLockEnabled as HTMLInputElement
		).checked;

		this.saveSettings();
	}

	private async saveSettings(): Promise<void> {
		try {
			await this.sendMessage({
				type: 'UPDATE_SETTINGS',
				data: { settings: this.state.settings },
			});
		} catch (error) {
			console.error('[PasswordManager: saveSettings]', error);
		}
	}

	private updateSettingsUI(): void {
		(this.elements.lockTimeout as HTMLSelectElement).value =
			this.state.settings.lockTimeout.toString();
		(this.elements.autoLockEnabled as HTMLInputElement).checked =
			this.state.settings.autoLockEnabled;
		(this.elements.passwordLength as HTMLInputElement).value =
			this.state.settings.passwordGenerator.length.toString();
		(this.elements.includeUppercase as HTMLInputElement).checked =
			this.state.settings.passwordGenerator.includeUppercase;
		(this.elements.includeLowercase as HTMLInputElement).checked =
			this.state.settings.passwordGenerator.includeLowercase;
		(this.elements.includeNumbers as HTMLInputElement).checked =
			this.state.settings.passwordGenerator.includeNumbers;
		(this.elements.includeSymbols as HTMLInputElement).checked =
			this.state.settings.passwordGenerator.includeSymbols;
	}

	private async exportData(): Promise<void> {
		try {
			const response = await this.sendMessage({ type: 'EXPORT_DATA' });
			if (response.success) {
				const blob = new Blob([JSON.stringify(response.data, null, 2)], {
					type: 'application/json',
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `securevault-backup-${
					new Date().toISOString().split('T')[0]
				}.json`;
				a.click();
				URL.revokeObjectURL(url);
				this.showSuccess('Data exported successfully');
			} else {
				this.showError(response.error || 'Failed to export data');
			}
		} catch (error) {
			console.error('[PasswordManager: exportData]', error);
			this.showError('Failed to export data');
		}
	}

	private async importData(event: Event): Promise<void> {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;

		try {
			const text = await file.text();
			const data = JSON.parse(text);

			const response = await this.sendMessage({
				type: 'IMPORT_DATA',
				data: { data },
			});

			if (response.success) {
				this.state.passwords = response.passwords;
				this.state.filteredPasswords = response.passwords;
				this.renderPasswordList();
				this.showSuccess('Data imported successfully');
			} else {
				this.showError(response.error || 'Failed to import data');
			}
		} catch (error) {
			console.error('[PasswordManager: importData]', error);
			this.showError('Failed to import data');
		}
	}

	private async sendMessage(message: Message): Promise<any> {
		return new Promise((resolve, reject) => {
			this.browser.runtime.sendMessage(message, (response: any) => {
				if (this.browser.runtime.lastError) {
					reject(this.browser.runtime.lastError);
				} else {
					resolve(response);
				}
			});
		});
	}

	private showError(message: string): void {
		// Show error in appropriate context
		if (!this.state.vaultExists) {
			this.showSetupError(message);
		} else if (this.state.isLocked) {
			this.showUnlockError(message);
		} else {
			// Show in main interface (could implement toast notifications)
			console.error(message);
		}
	}

	private showSuccess(message: string): void {
		// Could implement toast notifications
		console.log(message);
	}

	private showSetupError(message: string): void {
		this.elements.setupError.textContent = message;
		this.elements.setupError.classList.remove('hidden');
	}

	private showUnlockError(message: string): void {
		this.elements.unlockError.textContent = message;
		this.elements.unlockError.classList.remove('hidden');
	}
}

// Initialize the popup manager when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	(globalThis as any).popupManager = new PopupManager();
});

export default PopupManager;
