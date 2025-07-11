import { cryptoService } from './crypto';
import { passwordGenerator } from './password-generator';
import { storageService } from './storage';
import { Message, PasswordEntry, UserSettings } from './types';

class BackgroundService {
	private currentMasterKey: string | null = null;
	private lockTimeoutId: any;
	private browser: any;

	constructor() {
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

		this.browser.alarms.onAlarm.addListener((alarm) => {
			if (alarm.name === 'auto-lock') {
				this.lockVault();
			}
		});
	}

	private async handleMessage(message: Message, sender: any): Promise<any> {
		try {
			switch (message.type) {
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
				default:
					throw new Error(`Unknown message type: ${message.type}`);
			}
		} catch (error) {
			console.error('Background service error:', error);
			return { error: error.message };
		}
	}

	private async unlockVault(
		masterPassword: string
	): Promise<{ success: boolean; error?: string }> {
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
			return { success: true };
		} catch (error) {
			return { success: false, error: error.message };
		}
	}

	private async lockVault(): Promise<{ success: boolean }> {
		this.currentMasterKey = null;
		await storageService.clearSessionData();

		if (this.lockTimeoutId) clearTimeout(this.lockTimeoutId);
		this.lockTimeoutId = null;

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
		if (lockTimeout > 0) {
			this.browser.alarms.create('auto-lock', { delayInMinutes: lockTimeout });
		}
	}

	private async checkLockStatus(): Promise<void> {
		const sessionData = await storageService.getSessionData();
		if (sessionData?.tempSessionKey && !sessionData.isLocked) {
			this.currentMasterKey = sessionData.tempSessionKey;
			const sessionAge = Date.now() - sessionData.lastActivity;
			const maxAge = 24 * 60 * 60 * 1000;
			if (sessionAge > maxAge) await this.lockVault();
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
