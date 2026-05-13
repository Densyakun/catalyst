import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { generatePublishToken, verifyPublishToken } from '@/lib/publishToken';

/**
 * API Route to manage publication workflows.
 * 
 * SENDER ROLE (single mode):
 * - POST /api/publish with { action: 'send_publish', problemId, targetInstanceUrl }
 * - Fetches problem and linked actions/outcomes, creates short-lived JWT, and POSTs to target.
 * 
 * RECEIVER ROLE (multi mode):
 * - POST /api/publish with { token, source_instance_url, source_project_id, ... }
 * - Verifies the signature/expiry, runs an automated keyword screening, and queues in published_records.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawAppMode = process.env.APP_MODE || process.env.NEXT_PUBLIC_APP_MODE || 'single';
    const appMode = rawAppMode === 'multi' ? 'multi' : 'single';
    const sharedSecret = process.env.PUBLISH_SHARED_SECRET;

    if (!sharedSecret) {
      return NextResponse.json(
        { error: 'PUBLISH_SHARED_SECRET is not configured on this instance' },
        { status: 500 }
      );
    }

    // =============================================================
    // SENDER MODE (Active when APP_MODE is single and client triggers publish)
    // =============================================================
    if (body.action === 'send_publish') {
      if (appMode !== 'single') {
        return NextResponse.json(
          { error: 'The "send_publish" action is only valid in single-mode (household) instances.' },
          { status: 400 }
        );
      }

      const { problemId, targetInstanceUrl } = body;
      if (!problemId || !targetInstanceUrl) {
        return NextResponse.json(
          { error: 'Missing required fields: "problemId" and "targetInstanceUrl".' },
          { status: 400 }
        );
      }

      // 1. Fetch problem and its associated actions/outcomes
      const { data: problem, error: problemErr } = await supabaseAdmin
        .from('problems')
        .select('*')
        .eq('id', problemId)
        .single();

      if (problemErr || !problem) {
        return NextResponse.json(
          { error: `Problem not found or database error: ${problemErr?.message || 'Not Found'}` },
          { status: 404 }
        );
      }

      // Fetch linked actions
      const { data: actions, error: actionsErr } = await supabaseAdmin
        .from('actions')
        .select('*')
        .eq('problem_id', problemId);

      if (actionsErr) {
        return NextResponse.json(
          { error: `Failed to fetch related actions: ${actionsErr.message}` },
          { status: 500 }
        );
      }

      // Fetch linked outcomes
      const actionIds = actions?.map((a) => a.id) || [];
      const { data: outcomes, error: outcomesErr } = actionIds.length > 0
        ? await supabaseAdmin.from('outcomes').select('*').in('action_id', actionIds)
        : { data: [], error: null };

      if (outcomesErr) {
        return NextResponse.json(
          { error: `Failed to fetch related outcomes: ${outcomesErr.message}` },
          { status: 500 }
        );
      }

      // 2. Construct Short-lived Signature Token Payload
      const originUrl = request.headers.get('origin') || 'http://localhost:3000';
      const tokenPayload = {
        source_instance_url: originUrl,
        source_project_id: problemId,
        source_owner_id: problem.created_by || problem.user_id || null,
      };

      const token = generatePublishToken(tokenPayload, sharedSecret);

      // 3. Formulate structural data package for target instance
      const packagePayload = {
        token,
        source_instance_url: originUrl,
        source_project_id: problemId,
        source_owner_id: problem.created_by || problem.user_id || null,
        consent: {
          user_accepted: true,
          timestamp: new Date().toISOString(),
          app_version: '0.1.0'
        },
        payload: {
          problem,
          actions: actions || [],
          outcomes: outcomes || []
        }
      };

      // 4. Dispatch payload securely to target public instance
      const cleanTargetUrl = targetInstanceUrl.replace(/\/$/, '');
      const targetApiUrl = `${cleanTargetUrl}/api/publish`;

      console.log(`[Publishing] Dispatching payload to public instance: ${targetApiUrl}`);

      const response = await fetch(targetApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(packagePayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: `Target instance rejected publication: [${response.status}] ${errorText}` },
          { status: response.status }
        );
      }

      const responseJSON = await response.json();
      return NextResponse.json({
        success: true,
        message: 'Successfully exported and published project to the public repository!',
        remote_response: responseJSON
      });
    }

    // =============================================================
    // RECEIVER MODE (Active on target instances to process incoming publishes)
    // =============================================================
    const { token, source_instance_url, source_project_id, source_owner_id, consent, payload } = body;

    if (!token || !source_instance_url || !source_project_id || !payload) {
      return NextResponse.json(
        { error: 'Invalid publish request: Missing required token or structure.' },
        { status: 400 }
      );
    }

    // 1. Validate signature token
    try {
      const decoded = verifyPublishToken(token, sharedSecret);

      // Verify token payload matches body payload to prevent spoofing
      if (
        decoded.source_project_id !== source_project_id ||
        (source_owner_id && decoded.source_owner_id !== source_owner_id)
      ) {
        return NextResponse.json(
          { error: 'Token payloads do not match provided request structures.' },
          { status: 400 }
        );
      }
    } catch (err: any) {
      return NextResponse.json(
        { error: `Token signature validation failed: ${err.message}` },
        { status: 401 }
      );
    }

    // 2. Automated Screening (Secret detection placeholder)
    let moderationStatus = 'pending';
    const stringifiedPayload = JSON.stringify(payload).toLowerCase();
    
    // Safety check for obvious leaked variables
    const forbiddenKeywords = ['password', 'secret_key', 'private_key', 'creditcard', 'apikey', 'bearer '];
    const containsSensitiveWord = forbiddenKeywords.some(keyword => stringifiedPayload.includes(keyword));

    if (containsSensitiveWord) {
      moderationStatus = 'rejected';
      console.warn(`[Moderation] Automatically REJECTED publication for project ${source_project_id} due to sensitive content.`);
    } else {
      console.log(`[Moderation] Publication queued as PENDING for project ${source_project_id}.`);
    }

    // 3. Insert into the review queue (published_records) using Admin role
    const { data: record, error: dbErr } = await supabaseAdmin
      .from('published_records')
      .insert({
        source_instance_url,
        source_project_id,
        source_owner_id: source_owner_id || null,
        consent,
        moderation_status: moderationStatus,
        canonical_project_id: null // To be filled if/when an admin imports it
      })
      .select()
      .single();

    if (dbErr) {
      console.error('[DB Error] Failed to insert published record:', dbErr.message);
      return NextResponse.json(
        { error: `Internal database error: ${dbErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      published_record_id: record.id,
      moderation_status: moderationStatus,
      message: moderationStatus === 'rejected'
        ? 'Data received but automatically flagged and REJECTED by automated safety screening.'
        : 'Data received successfully and queued for review.'
    });

  } catch (err: any) {
    console.error('Error in Publish API Handler:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error occurred.' },
      { status: 500 }
    );
  }
}
