SELECT id, name, sport, status, open_time, close_time
  FROM public.courts  WHERE sport = 'padel'
  ORDER BY name;