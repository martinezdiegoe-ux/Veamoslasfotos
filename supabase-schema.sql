-- Veamoslasfotos: apply once in the existing project's SQL Editor.
-- No credentials. The private bucket only serves approved photos or admin requests.
begin;
create table public.vf_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.vf_admins enable row level security;
revoke all on public.vf_admins from anon, authenticated;
create function public.vf_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.vf_admins where user_id=auth.uid());
$$;
revoke all on function public.vf_is_admin() from public,anon,authenticated;
grant execute on function public.vf_is_admin() to anon,authenticated;
create table public.vf_settings (
 id int primary key check(id=1),open boolean not null default false,
 moderation boolean not null default true,seconds int not null default 8 check(seconds between 4 and 30)
);
insert into public.vf_settings(id) values(1);
alter table public.vf_settings enable row level security;
revoke all on public.vf_settings from anon,authenticated;
grant select on public.vf_settings to anon,authenticated;
grant update(open,moderation,seconds) on public.vf_settings to authenticated;
create policy vf_settings_read on public.vf_settings for select to anon,authenticated using(true);
create policy vf_settings_admin on public.vf_settings for update to authenticated using(public.vf_is_admin()) with check(public.vf_is_admin());
create table public.vf_photos (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 path text unique not null,name text not null check(length(name) between 1 and 50),
 caption text not null default '' check(length(caption)<=140),
 status text not null default 'draft' check(status in('draft','pending','approved','hidden')),
 created_at timestamptz not null default now()
);
create index vf_photos_status_created on public.vf_photos(status,created_at);
create index vf_photos_owner_created on public.vf_photos(owner_id,created_at);
alter table public.vf_photos enable row level security;
revoke all on public.vf_photos from anon,authenticated;
grant select,delete on public.vf_photos to authenticated;
grant update(status) on public.vf_photos to authenticated;
create policy vf_photo_admin_read on public.vf_photos for select to authenticated using(public.vf_is_admin());
create policy vf_photo_admin_update on public.vf_photos for update to authenticated using(public.vf_is_admin()) with check(public.vf_is_admin());
create policy vf_photo_admin_delete on public.vf_photos for delete to authenticated using(public.vf_is_admin());
create table public.vf_reactions (
 photo_id uuid references public.vf_photos(id) on delete cascade,
 visitor_id uuid references auth.users(id) on delete cascade,
 emoji text not null check(emoji in('❤️','😍','👏','🎉','✨')),
 updated_at timestamptz not null default now(),primary key(photo_id,visitor_id)
);
alter table public.vf_reactions enable row level security;
revoke all on public.vf_reactions from anon,authenticated;
create function public.vf_list_photos(include_pending boolean default false)
returns table(id uuid,path text,name text,caption text,status text,created_at timestamptz,reactions jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if include_pending and not public.vf_is_admin() then raise exception 'Acceso denegado'; end if;
 return query select p.id,p.path,p.name,p.caption,p.status,p.created_at,
 coalesce((select jsonb_object_agg(r.emoji,r.n) from(select emoji,count(*) n from public.vf_reactions where photo_id=p.id group by emoji)r),'{}'::jsonb)
 from public.vf_photos p where p.status='approved' or (include_pending and p.status<>'draft') order by p.created_at desc limit 1200;
end $$;
create function public.vf_reserve_photo(guest_name text,dedication text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare photo uuid:=gen_random_uuid(); object_path text;
begin
 if auth.uid() is null then raise exception 'Ingresá para compartir una foto'; end if;
 -- Serialize reservations to enforce total storage and per-visitor limits.
 perform pg_advisory_xact_lock(770011);
 if not exists(select 1 from public.vf_settings where id=1 and open) then raise exception 'El álbum no está recibiendo fotos'; end if;
 if (select count(*) from public.vf_photos)>=1200 then raise exception 'El álbum alcanzó su capacidad'; end if;
 if (select count(*) from public.vf_photos where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'Ya compartiste muchas fotos. Probá más tarde'; end if;
 object_path:=auth.uid()::text||'/'||photo::text||'.jpg';
 insert into public.vf_photos(id,owner_id,path,name,caption) values(photo,auth.uid(),object_path,left(coalesce(nullif(trim(guest_name),''),'Invitado'),50),left(coalesce(dedication,''),140));
 return jsonb_build_object('id',photo,'path',object_path);
end $$;
create function public.vf_storage_allowed(object_path text,operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select case when public.vf_is_admin() then true
 else exists(select 1 from public.vf_photos p where p.path=object_path and
 case operation when 'read' then p.status='approved'
 when 'insert' then p.owner_id=auth.uid() and p.status='draft' and p.created_at>now()-interval '10 minutes' and exists(select 1 from public.vf_settings where id=1 and open)
 when 'delete' then p.owner_id=auth.uid() and p.status='draft'
 else false end) end;
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('birthday-photos','birthday-photos',false,716800,array['image/jpeg']);
create policy vf_storage_read on storage.objects for select to anon,authenticated using(bucket_id='birthday-photos' and public.vf_storage_allowed(name,'read'));
create policy vf_storage_upload on storage.objects for insert to authenticated with check(bucket_id='birthday-photos' and public.vf_storage_allowed(name,'insert'));
create policy vf_storage_delete on storage.objects for delete to authenticated using(bucket_id='birthday-photos' and public.vf_storage_allowed(name,'delete'));
-- Storage DELETE also needs SELECT for the same draft owned by the visitor.
create policy vf_storage_draft_read on storage.objects for select to authenticated using(bucket_id='birthday-photos' and public.vf_storage_allowed(name,'delete'));
create function public.vf_finish_photo(photo_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if auth.uid() is null then raise exception 'Acceso denegado'; end if;
 if not exists(select 1 from public.vf_settings where id=1 and open) then raise exception 'El álbum no está recibiendo fotos'; end if;
 select case when moderation then 'pending' else 'approved' end into result from public.vf_settings where id=1;
 update public.vf_photos p set status=result where p.id=photo_id and p.owner_id=auth.uid() and p.status='draft'
 and exists(select 1 from storage.objects o where o.bucket_id='birthday-photos' and o.name=p.path);
 if not found then raise exception 'La foto todavía no se terminó de subir'; end if;
 return jsonb_build_object('id',photo_id,'status',result);
end $$;
create function public.vf_cancel_photo(photo_id uuid) returns void
language sql security definer set search_path='' as $$
 delete from public.vf_photos p where p.id=photo_id and p.owner_id=auth.uid() and p.status='draft'
 and not exists(select 1 from storage.objects o where o.bucket_id='birthday-photos' and o.name=p.path);
$$;
create function public.vf_react(photo_id uuid,reaction text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Acceso denegado'; end if;
 if reaction not in('❤️','😍','👏','🎉','✨') or reaction is null then raise exception 'Reacción inválida'; end if;
 if not exists(select 1 from public.vf_photos p where p.id=photo_id and p.status='approved') then raise exception 'Foto no disponible'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.vf_reactions r where r.photo_id=vf_react.photo_id and r.visitor_id=auth.uid() and r.updated_at>now()-interval '1 second') then raise exception 'Esperá un momento antes de reaccionar'; end if;
 if (select count(*) from public.vf_reactions where visitor_id=auth.uid() and updated_at>now()-interval '1 minute')>=30 then raise exception 'Esperá un momento antes de reaccionar'; end if;
 insert into public.vf_reactions(photo_id,visitor_id,emoji) values(photo_id,auth.uid(),reaction)
 on conflict on constraint vf_reactions_pkey do update set emoji=excluded.emoji,updated_at=now();
end $$;
revoke all on function public.vf_list_photos(boolean),public.vf_reserve_photo(text,text),public.vf_storage_allowed(text,text),public.vf_finish_photo(uuid),public.vf_cancel_photo(uuid),public.vf_react(uuid,text) from public,anon,authenticated;
grant execute on function public.vf_list_photos(boolean),public.vf_storage_allowed(text,text) to anon,authenticated;
grant execute on function public.vf_reserve_photo(text,text),public.vf_finish_photo(uuid),public.vf_cancel_photo(uuid),public.vf_react(uuid,text) to authenticated;
commit;
