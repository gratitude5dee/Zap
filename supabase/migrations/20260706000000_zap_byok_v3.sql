-- Zap v0.3.0 BYOK expansion for Vertex AI and Amazon Bedrock.
-- Forward-only: widen provider/secret constraints used by the zap-user-secrets Edge Function.

alter table public.user_secrets
  drop constraint if exists user_secrets_secret_type_check,
  add constraint user_secrets_secret_type_check
    check (
      secret_type in (
        'aws_access_key_id',
        'aws_region',
        'aws_role_arn',
        'aws_s3_output_uri',
        'aws_secret_access_key',
        'aws_session_token',
        'gmi_api_key',
        'gmi_org_id',
        'fal_key',
        'prodia_token',
        'runware_key',
        'openrouter_key',
        'ai_gateway_api_key',
        'vertex_api_key',
        'vertex_location',
        'vertex_output_gcs_uri',
        'vertex_project',
        'vertex_service_account'
      )
    );

alter table public.user_secrets
  drop constraint if exists user_secrets_provider_check,
  add constraint user_secrets_provider_check
    check (provider in ('aws', 'gmi', 'fal', 'prodia', 'runware', 'vertex', 'openrouter', 'ai_gateway'));

create index if not exists user_secrets_provider_idx
  on public.user_secrets (provider);
