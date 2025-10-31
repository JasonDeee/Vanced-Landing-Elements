// Simple test worker to debug the issue
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// CORS headers
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		// Handle preflight request
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		// Health check endpoint
		if (request.method === 'GET') {
			return new Response(
				JSON.stringify({
					status: 'running',
					message: 'Simple test worker is running!',
					timestamp: new Date().toISOString(),
				}),
				{
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				}
			);
		}

		// Handle POST requests
		if (request.method === 'POST') {
			try {
				const body = await request.json();

				if (body.action === 'initChat') {
					return new Response(
						JSON.stringify({
							status: 'success',
							message: 'Test initChat working',
							machineId: 'test123',
							chatHistory: [],
							userType: 'new_user',
							rpdRemaining: 15,
							timestamp: new Date().toISOString(),
						}),
						{
							headers: { ...corsHeaders, 'Content-Type': 'application/json' },
						}
					);
				}

				return new Response(
					JSON.stringify({
						status: 'error',
						message: 'Unknown action',
					}),
					{
						headers: { ...corsHeaders, 'Content-Type': 'application/json' },
					}
				);
			} catch (error) {
				return new Response(
					JSON.stringify({
						status: 'error',
						message: 'Error processing request',
						error: error.message,
					}),
					{
						status: 500,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' },
					}
				);
			}
		}

		return new Response('Method not allowed', {
			status: 405,
			headers: corsHeaders,
		});
	},
};
// Simple Durable Object for testing
export class P2PSignalingRoom {
	constructor(state, env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request) {
		return new Response('Durable Object test', { status: 200 });
	}
}
