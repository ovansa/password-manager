import { CryptoUtils } from './types';

class CryptoService implements CryptoUtils {
	private readonly ALGORITHM = 'AES-GCM';
	private readonly KEY_LENGTH = 256;
	private readonly IV_LENGTH = 12;
	private readonly SALT_LENGTH = 16;
	private readonly PBKDF2_ITERATIONS = 100000;

	async encrypt(data: string, key: string): Promise<string> {
		const encoder = new TextEncoder();
		const dataBuffer = encoder.encode(data);

		const cryptoKey = await this.importKey(key);
		const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

		const encryptedBuffer = await crypto.subtle.encrypt(
			{ name: this.ALGORITHM, iv },
			cryptoKey,
			dataBuffer
		);

		const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
		combined.set(iv);
		combined.set(new Uint8Array(encryptedBuffer), iv.length);

		return this.arrayBufferToBase64(combined);
	}

	async decrypt(encryptedData: string, key: string): Promise<string> {
		const combined = this.base64ToArrayBuffer(encryptedData);
		const iv = combined.slice(0, this.IV_LENGTH);
		const data = combined.slice(this.IV_LENGTH);

		const cryptoKey = await this.importKey(key);

		const decryptedBuffer = await crypto.subtle.decrypt(
			{ name: this.ALGORITHM, iv },
			cryptoKey,
			data
		);

		const decoder = new TextDecoder();
		return decoder.decode(decryptedBuffer);
	}

	async hash(data: string, salt: string): Promise<string> {
		const encoder = new TextEncoder();
		const dataBuffer = encoder.encode(data + salt);

		const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
		return this.arrayBufferToBase64(new Uint8Array(hashBuffer));
	}

	generateSalt(): string {
		const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
		return this.arrayBufferToBase64(salt);
	}

	async deriveKey(password: string, salt: string): Promise<string> {
		const encoder = new TextEncoder();
		const passwordBuffer = encoder.encode(password);
		const saltBuffer = this.base64ToArrayBuffer(salt);

		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			passwordBuffer,
			'PBKDF2',
			false,
			['deriveBits']
		);

		const derivedBits = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: saltBuffer,
				iterations: this.PBKDF2_ITERATIONS,
				hash: 'SHA-256',
			},
			keyMaterial,
			this.KEY_LENGTH
		);

		return this.arrayBufferToBase64(new Uint8Array(derivedBits));
	}

	private async importKey(key: string): Promise<CryptoKey> {
		const keyBuffer = this.base64ToArrayBuffer(key);

		return await crypto.subtle.importKey(
			'raw',
			keyBuffer,
			{ name: this.ALGORITHM },
			false,
			['encrypt', 'decrypt']
		);
	}

	private arrayBufferToBase64(buffer: Uint8Array): string {
		let binary = '';
		const bytes = buffer;
		const len = bytes.byteLength;

		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}

		return btoa(binary);
	}

	private base64ToArrayBuffer(base64: string): Uint8Array {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}
}

export const cryptoService = new CryptoService();
