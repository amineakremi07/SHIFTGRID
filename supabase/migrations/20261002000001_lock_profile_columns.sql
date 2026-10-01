-- Close a privilege-escalation hole on profiles (2026-10-02)
--
-- The policy "Users can update their own profile" is row-level only
-- (USING id = auth.uid()), and `authenticated` held UPDATE on every column. Any
-- signed-in user, including a `staff` member or a player, could therefore call the
-- API and set their own `role` to 'org_admin' (or change `org_id` to join another
-- club). Found by running the staff privilege checks for Milestone 7.
--
-- Fix at the privilege level, where RLS cannot express it: clients may update only
-- harmless profile fields. Role and organization changes are made by the server
-- (service role) after its own authorization checks.

REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (display_name, phone, avatar_url) ON public.profiles TO authenticated;
