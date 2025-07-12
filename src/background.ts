import { cryptoService } from './crypto';
import { passwordGenerator } from './password-generator';
import { storageService } from './storage';
import { Message, PasswordEntry, UserSettings } from './types';

class BackgroundService {
	private currentMasterKey: string | null = null;
	private lockTimeoutId: any;
	private browser: any;

	constructor() {
		this.browser = (globalThis as any).browser || (globalThis as any).chrome;
		this.initializeListeners();
		this.checkLockStatus();
	}

	private initializeListeners(): void {
		this.browser.runtime.onMessage.addListener(
			(message, sender, sendResponse) => {
				this.handleMessage(message, sender).then(sendResponse);
				return true;
			}
		);

		this.browser.runtime.onInstalled.addListener(() => {
			this.browser.contextMenus.create({
				id: 'generate-password',
				title: 'Generate Password',
				contexts: ['editable'],
			});
		});

		this.browser.contextMenus.onClicked.addListener((info, tab) => {
			if (info.menuItemId === 'generate-password' && tab?.id) {
				this.handleGeneratePassword(tab.id);
			}
		});

		this.browser.tabs.onActivated.addListener((activeInfo) => {
			this.updateCurrentTab(activeInfo.tabId);
		});

		this.browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
			if (changeInfo.status === 'complete' && tab.url) {
				this.updateCurrentTab(tabId);
			}
		});

		if (this.browser.alarms?.onAlarm) {
			this.browser.alarms.onAlarm.addListener((alarm) => {
				if (alarm.name === 'auto-lock') {
					this.lockVault();
				}
			});
		} else {
			console.warn('Alarms API is not available in this context.');
		}
	}

	private async handleMessage(message: Message, sender: any): Promise<any> {
		console.log('[PasswordManager: Message]', message);
		try {
			switch (message.type) {
				case 'CREATE_VAULT':
					return await this.createVault(message.data.masterPassword);
				case 'UNLOCK_VAULT':
					return await this.unlockVault(message.data.masterPassword);
				case 'LOCK_VAULT':
					return await this.lockVault();
				case 'GET_ENTRIES':
					return await this.getEntries(message.data?.url);
				case 'SAVE_ENTRY':
					return await this.saveEntry(message.data.entry);
				case 'DELETE_ENTRY':
					return await this.deleteEntry(message.data.id);
				case 'GENERATE_PASSWORD':
					return await this.generatePassword(message.data?.settings);
				case 'AUTO_FILL':
					return await this.autoFill(message.data.entryId, sender.tab?.id);
				case 'CHECK_FORMS':
					return await this.checkForLoginForms(sender.tab?.id);
				case 'SYNC_DATA':
					return await this.syncData();
				case 'EXPORT_DATA':
					return await this.exportData();
				case 'IMPORT_DATA':
					return await this.importData(message.data.importData);
				case 'CHECK_LOCK_STATUS':
					return await this.checkLockStatus();
				case 'GET_SETTINGS':
					return await this.getSettings();
				case 'UPDATE_SETTINGS':
					return await this.updateSettings(message.data.settings);
				default:
					throw new Error(`Unknown message type: ${message.type}`);
			}
		} catch (error) {
			console.error('Background service error:', error);
			return { error: error.message };
		}
	}

	private async createVault(
		masterPassword: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			const defaultSettings: UserSettings = {
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
			};

			// Call storage service to create vault
			const vaultData = await storageService.createVault(
				masterPassword,
				defaultSettings
			);

			// Store vault salt for unlocking later
			await this.browser.storage.local.set({ vault_salt: vaultData.salt });

			// Derive the master key again (used for session)
			const masterKey = await cryptoService.deriveKey(
				masterPassword,
				vaultData.salt
			);
			this.currentMasterKey = masterKey;

			// Save session data
			await storageService.saveSessionData({
				isLocked: false,
				tempSessionKey: masterKey,
				lastActivity: Date.now(),
			});

			// Setup auto-lock
			this.setupAutoLock(defaultSettings.lockTimeout);

			return { success: true };
		} catch (error) {
			console.error('Error creating vault:', error);
			return { success: false, error: error.message };
		}
	}

	private async updateSettings(
		settings: UserSettings
	): Promise<{ success: boolean }> {
		try {
			if (!this.currentMasterKey) throw new Error('Vault is locked');

			// Load current vault
			const vault = await storageService.loadVault(this.currentMasterKey);
			if (!vault) throw new Error('Vault not found');

			// Update settings
			vault.settings = settings;
			vault.updatedAt = Date.now();

			// Save updated vault
			await storageService.saveVault(vault, this.currentMasterKey);

			// Update auto-lock timer - this is the correct place for setupAutoLock
			this.setupAutoLock(settings.lockTimeout);

			return { success: true };
		} catch (error) {
			console.error('Error updating settings:', error);
			return { success: false, error: error.message };
		}
	}

	private async getSettings(): Promise<UserSettings | null> {
		try {
			if (!this.currentMasterKey) return null;

			const vault = await storageService.loadVault(this.currentMasterKey);
			return vault?.settings || null;
		} catch (error) {
			console.error('Error getting settings:', error);
			return null;
		}
	}

	private async unlockVault(
		masterPassword: string
	): Promise<{
		success: boolean;
		passwords?: PasswordEntry[];
		error?: string;
	}> {
		try {
			const salt = await this.getVaultSalt();
			if (!salt) return { success: false, error: 'Vault not found' };

			const masterKey = await cryptoService.deriveKey(masterPassword, salt);
			const vault = await storageService.loadVault(masterKey);

			if (!vault) return { success: false, error: 'Invalid master password' };

			this.currentMasterKey = masterKey;
			await storageService.saveSessionData({
				isLocked: false,
				tempSessionKey: masterKey,
			});
			this.setupAutoLock(vault.settings.lockTimeout);

			const passwords = await storageService.getEntries(masterKey);

			return { success: true, passwords };
		} catch (error) {
			return { success: false, error: error.message };
		}
	}

	private async lockVault(): Promise<{ success: boolean }> {
		this.currentMasterKey = null;
		await storageService.clearSessionData();

		// Clear any existing timeout or alarm
		if (this.lockTimeoutId) {
			clearTimeout(this.lockTimeoutId);
			this.lockTimeoutId = null;
		}
		this.browser.alarms.clear('auto-lock');

		return { success: true };
	}

	private async getEntries(url?: string): Promise<PasswordEntry[]> {
		if (!this.currentMasterKey) throw new Error('Vault is locked');
		return url
			? await storageService.getEntriesForUrl(url, this.currentMasterKey)
			: await storageService.getEntries(this.currentMasterKey);
	}

	private async saveEntry(entry: PasswordEntry): Promise<{ success: boolean }> {
		if (!this.currentMasterKey) throw new Error('Vault is locked');
		await storageService.saveEntry(entry, this.currentMasterKey);
		return { success: true };
	}

	private async deleteEntry(entryId: string): Promise<{ success: boolean }> {
		if (!this.currentMasterKey) throw new Error('Vault is locked');
		await storageService.deleteEntry(entryId, this.currentMasterKey);
		return { success: true };
	}

	private async generatePassword(
		settings?: UserSettings['passwordGenerator']
	): Promise<string> {
		const defaultSettings: UserSettings['passwordGenerator'] = {
			length: 16,
			includeUppercase: true,
			includeLowercase: true,
			includeNumbers: true,
			includeSymbols: true,
			excludeSimilar: true,
		};
		return passwordGenerator.generate(settings || defaultSettings);
	}

	private async autoFill(
		entryId: string,
		tabId?: number
	): Promise<{ success: boolean }> {
		if (!this.currentMasterKey || !tabId)
			throw new Error('Vault is locked or no tab specified');

		const entries = await storageService.getEntries(this.currentMasterKey);
		const entry = entries.find((e) => e.id === entryId);
		if (!entry) throw new Error('Entry not found');

		entry.lastUsed = Date.now();
		await storageService.saveEntry(entry, this.currentMasterKey);

		await this.browser.tabs.sendMessage(tabId, {
			type: 'AUTOFILL_FORM',
			data: { username: entry.username, password: entry.password },
		});

		return { success: true };
	}

	private async checkForLoginForms(
		tabId?: number
	): Promise<{ hasLoginForm: boolean }> {
		if (!tabId) return { hasLoginForm: false };
		try {
			const response = await this.browser.tabs.sendMessage(tabId, {
				type: 'CHECK_LOGIN_FORM',
			});
			return { hasLoginForm: response.hasLoginForm };
		} catch {
			return { hasLoginForm: false };
		}
	}

	private async syncData(): Promise<{ success: boolean }> {
		return { success: true };
	}

	private async exportData(): Promise<string> {
		if (!this.currentMasterKey) throw new Error('Vault is locked');
		return await storageService.exportVault(this.currentMasterKey);
	}

	private async importData(importData: string): Promise<{ success: boolean }> {
		if (!this.currentMasterKey) throw new Error('Vault is locked');
		await storageService.importVault(importData, this.currentMasterKey);
		return { success: true };
	}

	private async handleGeneratePassword(tabId: number): Promise<void> {
		const password = await this.generatePassword();
		await this.browser.tabs.sendMessage(tabId, {
			type: 'INSERT_GENERATED_PASSWORD',
			data: { password },
		});
	}

	private async updateCurrentTab(tabId: number): Promise<void> {
		try {
			const tab = await this.browser.tabs.get(tabId);
			if (tab.url && this.currentMasterKey) {
				const entries = await storageService.getEntriesForUrl(
					tab.url,
					this.currentMasterKey
				);
				const text = entries.length > 0 ? entries.length.toString() : '';
				await this.browser.action.setBadgeText({ text, tabId });
				await this.browser.action.setBadgeBackgroundColor({ color: '#4CAF50' });
			}
		} catch {
			// Tab might be closed
		}
	}

	private async setupAutoLock(lockTimeout: number): Promise<void> {
		// Clear any existing timeout or alarm
		if (this.lockTimeoutId) {
			clearTimeout(this.lockTimeoutId);
			this.lockTimeoutId = null;
		}
		this.browser.alarms.clear('auto-lock');

		// Only set up auto-lock if timeout is greater than 0
		if (lockTimeout > 0) {
			// Set both a timeout and an alarm for redundancy
			this.lockTimeoutId = setTimeout(() => {
				this.lockVault();
			}, lockTimeout * 60 * 1000); // Convert minutes to milliseconds

			this.browser.alarms.create('auto-lock', {
				delayInMinutes: lockTimeout,
			});
		}
	}

	private async checkLockStatus(): Promise<{
		isLocked: boolean;
		needsSetup: boolean;
		vaultExists: boolean;
		passwords?: PasswordEntry[];
		settings?: UserSettings;
	}> {
		try {
			const vaultExists = await this.vaultExists();
			if (!vaultExists) {
				return { isLocked: true, needsSetup: true, vaultExists: false };
			}

			const sessionData = await storageService.getSessionData();

			if (!sessionData)
				return { isLocked: true, needsSetup: false, vaultExists: true };

			if (sessionData.tempSessionKey && !sessionData.isLocked) {
				const sessionAge = Date.now() - (sessionData.lastActivity || 0);
				const maxAge = 24 * 60 * 60 * 1000; // 24 hours

				if (sessionAge > maxAge) {
					await this.lockVault();
					return { isLocked: true, needsSetup: false, vaultExists: true };
				}

				// Session is valid, restore the key
				this.currentMasterKey = sessionData.tempSessionKey;

				const [passwords, vault] = await Promise.all([
					storageService.getEntries(this.currentMasterKey),
					storageService.loadVault(this.currentMasterKey),
				]);

				return {
					isLocked: false,
					needsSetup: false,
					vaultExists: true,
					passwords,
					settings: vault?.settings,
				};
			}

			return { isLocked: true, needsSetup: false, vaultExists: true };
		} catch (error) {
			console.error('Error checking lock status:', error);
			return { isLocked: true, needsSetup: false, vaultExists: true };
		}
	}

	private async vaultExists(): Promise<boolean> {
		try {
			const result = await this.browser.storage.local.get(['vault_salt']);
			return !!result.vault_salt;
		} catch (error) {
			return false;
		}
	}

	private async getVaultSalt(): Promise<string | null> {
		try {
			const result = await this.browser.storage.local.get(['vault_salt']);
			return result.vault_salt || null;
		} catch {
			return null;
		}
	}

	private resetAutoLock(): void {
		if (this.lockTimeoutId) clearTimeout(this.lockTimeoutId);
		this.browser.alarms.clear('auto-lock');
		this.setupAutoLock(15);
	}
}

new BackgroundService();
