/**
 * 默认字符集（ASCII 升序排列）
 * 传入自定义 alphabet 时也**必须按 ASCII 升序**，否则字典序 ≠ 时间序
 * 字符集顺序 = 编码大小顺序，'0' < '9' < 'A' < 'Z' < 'a' < 'z'
 */
const defaultAlphabet =
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function encode(num: number, alphabet: string): string {
	const base = alphabet.length;
	if (num === 0) return alphabet[0];
	let result = '';
	while (num > 0) {
		result = alphabet[num % base] + result;
		num = Math.floor(num / base);
	}
	return result;
}

function getRandomValues(length: number): Uint8Array {
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		return crypto.getRandomValues(new Uint8Array(length));
	}
	if (typeof require !== 'undefined') {
		return require('node:crypto').webcrypto.getRandomValues(new Uint8Array(length));
	}
	throw new Error('crypto.getRandomValues is not available');
}

function randomString(length: number, alphabet: string): string {
	const base = alphabet.length;
	const maxValid = 256 - (256 % base);
	const bytes = getRandomValues(length);
	let result = '';
	for (let i = 0; i < bytes.length; i++) {
		if (result.length >= length) break;
		if (bytes[i] < maxValid) {
			result += alphabet[bytes[i] % base];
		}
	}
	if (result.length < length) {
		result += randomString(length - result.length, alphabet);
	}
	return result;
}

let lastTime = 0;
let counter = 0;

/**
 * @param size    ID 总长度（默认 16）。太小时会因放不下时间戳前缀而抛错
 * @param alphabet 字符集，**必须按 ASCII 升序排列**，否则字典序 ≠ 时间序
 *                 仅单进程内保证单调递增，多实例需外部协调
 */
export type TimeIdOptions = {
	size?: number;
	alphabet?: string;
};

export function timeId(options?: TimeIdOptions): string {
	const { size = 16, alphabet = defaultAlphabet } = options ?? {};
	const base = alphabet.length;

	if (size < 1) throw new Error('size must be at least 1');
	if (base < 2) throw new Error('alphabet must have at least 2 characters');

	let now = Date.now();

	if (now === lastTime) {
		counter++;
		if (counter >= base * base) {
			while (Date.now() === lastTime) { /* spin to next ms */ }
			now = Date.now();
			counter = 0;
		}
	} else {
		counter = 0;
	}
	lastTime = now;

	const ts = encode(now, alphabet);
	if (ts.length > size) {
		throw new Error(`size ${size} is too small for timestamp prefix (${ts.length})`);
	}

	const randomLen = size - ts.length;
	if (randomLen < 2) {
		throw new Error(`size ${size} leaves no room for 2-char counter plus random`);
	}

	return ts + encode(counter, alphabet).padStart(2, alphabet[0]) +
		(randomLen > 2 ? randomString(randomLen - 2, alphabet) : '');
}