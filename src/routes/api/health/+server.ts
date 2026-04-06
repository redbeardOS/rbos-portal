import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json({
		status: 'ok',
		version: '0.2.0',
		agents: ['FLUX', 'SAM']
	});
};