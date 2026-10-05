-- Security advisor: function_search_path_mutable. The function only reads a setting, so an empty path is safe.
ALTER FUNCTION public.hard_delete_allowed() SET search_path = '';
