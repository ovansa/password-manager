import { cryptoService } from './crypto';
import { PasswordEntry, StorageData, UserSettings, VaultData } from './types';

export class StorageService {
	private browser = (globalThis as any).browser || (globalThis as any).chrome;
	private static readonly STORAGE_KEYS = {
		VAULT: 'vault_data',
		SESSION: 'session_data',
		SETTINGS: 'user_settings',
	};

	async saveVault(vaultData: VaultData, masterKey: string): Promise<void> {
		const serializedData = JSON.stringify(vaultData);
		const encryptedData = await cryptoService.encrypt(
			serializedData,
			masterKey
		);

		try {
			await this.browser.storage.sync.set({
				[StorageService.STORAGE_KEYS.VAULT]: encryptedData,
			});
			console.log('[PasswordManager] Settings saved:', encryptedData);
		} catch (error) {
			console.error('[PasswordManager] Failed to save vault settings:', error);
			throw error;
		}
	}

	async loadVault(masterKey: string): Promise<VaultData | null> {
		const result = await this.browser.storage.sync.get([
			StorageService.STORAGE_KEYS.VAULT,
		]);
		const encryptedData = result[StorageService.STORAGE_KEYS.VAULT];

		if (!encryptedData) return null;

		try {
			const decryptedData = await cryptoService.decrypt(
				encryptedData,
				masterKey
			);
			return JSON.parse(decryptedData) as VaultData; // Fixed: using decryptedData instead of encryptedData
		} catch (error) {
			console.error('Failed to decrypt vault data:', error);
			return null;
		}
	}

	async saveEntry(entry: PasswordEntry, masterKey: string): Promise<void> {
		const vault = await this.loadVault(masterKey);
		if (!vault) {
			throw new Error('Vault not found or cannot be decrypted');
		}

		const existingIndex = vault.entries.findIndex((e) => e.id === entry.id);
		if (existingIndex >= 0) {
			vault.entries[existingIndex] = { ...entry, updatedAt: Date.now() };
		} else {
			vault.entries.push(entry);
		}

		vault.updatedAt = Date.now();
		await this.saveVault(vault, masterKey);
	}

	async deleteEntry(entryId: string, masterKey: string): Promise<void> {
		const vault = await this.loadVault(masterKey);
		if (!vault) {
			throw new Error('Vault not found or cannot be decrypted');
		}

		vault.entries = vault.entries.filter((e) => e.id !== entryId);
		vault.updatedAt = Date.now();
		await this.saveVault(vault, masterKey);
	}

	async getEntries(masterKey: string): Promise<PasswordEntry[]> {
		const vault = await this.loadVault(masterKey);
		return vault?.entries || [];
	}

	async searchEntries(
		query: string,
		masterKey: string
	): Promise<PasswordEntry[]> {
		const entries = await this.getEntries(masterKey);
		const lowercaseQuery = query.toLowerCase();

		return entries.filter(
			(entry) =>
				entry.title.toLowerCase().includes(lowercaseQuery) ||
				entry.url.toLowerCase().includes(lowercaseQuery) ||
				entry.username.toLowerCase().includes(lowercaseQuery) ||
				entry.tags?.some((tag) => tag.toLowerCase().includes(lowercaseQuery))
		);
	}

	async getEntriesForUrl(
		url: string,
		masterKey: string
	): Promise<PasswordEntry[]> {
		const entries = await this.getEntries(masterKey);
		const domain = this.extractDomain(url);

		return entries.filter((entry) => {
			const entryDomain = this.extractDomain(entry.url);
			return entryDomain === domain;
		});
	}

	async createVault(
		masterPassword: string,
		settings: UserSettings
	): Promise<VaultData> {
		const salt = cryptoService.generateSalt();
		const masterPasswordHash = await cryptoService.hash(masterPassword, salt);

		const vaultData: VaultData = {
			entries: [],
			masterPasswordHash,
			salt,
			settings,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		const masterKey = await cryptoService.deriveKey(masterPassword, salt);
		await this.saveVault(vaultData, masterKey);

		await this.browser.storage.local.set({ vault_salt: salt });

		return vaultData;
	}

	async verifyMasterPassword(password: string): Promise<boolean> {
		const result = await this.browser.storage.sync.get([
			StorageService.STORAGE_KEYS.VAULT,
		]);
		const encryptedData = result[StorageService.STORAGE_KEYS.VAULT];

		if (!encryptedData) {
			return false;
		}

		try {
			// First try to get salt from local storage
			const saltResult = await this.browser.storage.local.get(['vault_salt']);
			const salt = saltResult.vault_salt;

			if (!salt) {
				// Fallback to trying to decrypt with empty salt to extract salt
				const tempKey = await cryptoService.deriveKey(password, '');
				const tempVault = await this.loadVault(tempKey);
				if (!tempVault) return false;

				const masterPasswordHash = await cryptoService.hash(
					password,
					tempVault.salt
				);
				return masterPasswordHash === tempVault.masterPasswordHash;
			}

			const masterPasswordHash = await cryptoService.hash(password, salt);
			const tempKey = await cryptoService.deriveKey(password, salt);
			const tempVault = await this.loadVault(tempKey);

			return (
				tempVault !== null &&
				masterPasswordHash === tempVault.masterPasswordHash
			);
		} catch (error) {
			return false;
		}
	}

	async isVaultExists(): Promise<boolean> {
		const result = await this.browser.storage.sync.get([
			StorageService.STORAGE_KEYS.VAULT,
		]);
		return !!result[StorageService.STORAGE_KEYS.VAULT];
	}

	async saveSessionData(data: Partial<StorageData>): Promise<void> {
		await this.browser.storage.session.set({
			[StorageService.STORAGE_KEYS.SESSION]: {
				...data,
				lastActivity: Date.now(),
			},
		});
	}

	async getSessionData(): Promise<StorageData | null> {
		const result = await this.browser.storage.session.get([
			StorageService.STORAGE_KEYS.SESSION,
		]);
		return result[StorageService.STORAGE_KEYS.SESSION] || null;
	}

	async clearSessionData(): Promise<void> {
		await this.browser.storage.session.remove([
			StorageService.STORAGE_KEYS.SESSION,
		]);
	}

	async exportVault(masterKey: string): Promise<string> {
		const vault = await this.loadVault(masterKey);
		if (!vault) {
			throw new Error('Vault not found');
		}

		const exportData = {
			entries: vault.entries,
			exportedAt: Date.now(),
			version: '1.0',
		};

		return JSON.stringify(exportData, null, 2);
	}

	async importVault(importData: string, masterKey: string): Promise<void> {
		const data = JSON.parse(importData);
		const vault = await this.loadVault(masterKey);

		if (!vault) {
			throw new Error('Vault not found');
		}

		// Merge imported entries with existing ones
		const existingIds = new Set(vault.entries.map((e) => e.id));
		const newEntries = data.entries.filter(
			(entry: PasswordEntry) => !existingIds.has(entry.id)
		);

		vault.entries.push(...newEntries);
		vault.updatedAt = Date.now();

		await this.saveVault(vault, masterKey);
	}

	private extractDomain(url: string): string {
		try {
			const urlObj = new URL(url);
			return urlObj.hostname;
		} catch {
			return url;
		}
	}
}

export const storageService = new StorageService();
