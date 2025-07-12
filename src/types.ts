export interface PasswordEntry {
	id: string;
	title: string;
	url: string;
	username: string;
	password: string;
	notes?: string;
	tags?: string[];
	createdAt: number;
	updatedAt: number;
	lastUsed?: number;
	isFavorite?: boolean;
}

export interface VaultData {
	entries: PasswordEntry[];
	masterPasswordHash: string;
	salt: string;
	settings: UserSettings;
	createdAt: number;
	updatedAt: number;
}

export interface UserSettings {
	autoFill?: boolean;
	autoSave?: boolean;
	lockTimeout: number; // in minutes
	syncEnabled?: boolean;
	syncProvider?: 'google' | 'github' | 'custom';
	autoLockEnabled?: boolean;
	passwordGenerator: {
		length: number;
		includeUppercase: boolean;
		includeLowercase: boolean;
		includeNumbers: boolean;
		includeSymbols: boolean;
		excludeSimilar: boolean;
	};
}

export interface FormField {
	element: HTMLInputElement;
	type: 'username' | 'password' | 'email';
	value: string;
}

export interface LoginForm {
	url: string;
	usernameField?: FormField;
	passwordField?: FormField;
	submitButton?: HTMLElement;
}

export interface SyncData {
	vaultData: VaultData;
	timestamp: number;
	checksum: string;
}

export interface StorageData {
	vault?: VaultData;
	isLocked: boolean;
	lastActivity: number;
	tempSessionKey?: string;
}

export interface Message {
	type:
		| 'GET_ENTRIES'
		| 'SAVE_ENTRY'
		| 'DELETE_ENTRY'
		| 'UNLOCK_VAULT'
		| 'LOCK_VAULT'
		| 'GENERATE_PASSWORD'
		| 'AUTO_FILL'
		| 'CHECK_FORMS'
		| 'SYNC_DATA'
		| 'EXPORT_DATA'
		| 'IMPORT_DATA'
		| 'CHECK_LOCK_STATUS';
	data?: any;
	tabId?: number;
}

export interface CryptoUtils {
	encrypt(data: string, key: string): Promise<string>;
	decrypt(encryptedData: string, key: string): Promise<string>;
	hash(data: string, salt: string): Promise<string>;
	generateSalt(): string;
	deriveKey(password: string, salt: string): Promise<string>;
}
