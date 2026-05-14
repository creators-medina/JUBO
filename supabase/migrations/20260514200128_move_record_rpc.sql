-- Atomic record movement: updates record, logs movement, logs activity
CREATE OR REPLACE FUNCTION public.move_record(
  p_record_id      UUID,
  p_to_group_id    UUID,
  p_moved_by       UUID,
  p_movement_type  public.movement_type DEFAULT 'stage_change'
)
RETURNS VOID AS $$
DECLARE
  v_from_group_id  UUID;
  v_org_id         UUID;
BEGIN
  -- Get current state
  SELECT group_id, organization_id
  INTO v_from_group_id, v_org_id
  FROM public.records
  WHERE id = p_record_id;

  -- Update record group
  UPDATE public.records
  SET group_id = p_to_group_id, updated_at = NOW()
  WHERE id = p_record_id;

  -- Log movement
  INSERT INTO public.record_movements (organization_id, record_id, from_group_id, to_group_id, moved_by, movement_type)
  VALUES (v_org_id, p_record_id, v_from_group_id, p_to_group_id, p_moved_by, p_movement_type);

  -- Log activity
  INSERT INTO public.activities (organization_id, record_id, user_id, activity_type, metadata)
  VALUES (
    v_org_id,
    p_record_id,
    p_moved_by,
    'status_change',
    jsonb_build_object(
      'from_group_id', v_from_group_id,
      'to_group_id', p_to_group_id,
      'movement_type', p_movement_type::text
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
