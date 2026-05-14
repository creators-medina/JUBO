-- Enable full row data for realtime events
ALTER TABLE public.records REPLICA IDENTITY FULL;
ALTER TABLE public.field_values REPLICA IDENTITY FULL;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.board_groups REPLICA IDENTITY FULL;
ALTER TABLE public.fields REPLICA IDENTITY FULL;
ALTER TABLE public.activities REPLICA IDENTITY FULL;

-- Add records and related tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.field_values;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.board_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fields;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
