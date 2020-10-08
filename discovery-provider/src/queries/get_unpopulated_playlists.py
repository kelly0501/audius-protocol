import json
from flask.json import dumps

from src.utils import redis_connection
from src.models import Playlist
from src.utils import helpers

ttl_sec = 60


def get_playlist_id_cache_key(id):
    return "playlist:id:{}".format(id)


def get_cached_playlists(playlist_ids):
    redis_playlist_id_keys = map(get_playlist_id_cache_key, playlist_ids)
    redis = redis_connection.get_redis()
    cached_values = redis.mget(redis_playlist_id_keys)
    return [json.loads(val) if val is not None else None for val in cached_values]


def set_playlists_in_cache(playlists):
    redis = redis_connection.get_redis()
    for playlist in playlists:
        key = get_playlist_id_cache_key(playlist['playlist_id'])
        serialized = dumps(playlist)
        redis.set(key, serialized, ttl_sec)


def get_unpopulated_playlists(session, playlist_ids):
    """
    Fetches playlists by checking the redis cache first then
    going to DB and writes to cache if not present

    Args:
        session: DB session
        playlist_ids: array A list of playlist ids

    Returns:
        Array of playlists
    """
    # Check the cached playlists
    cached_playlists_results = get_cached_playlists(playlist_ids)
    has_all_playlists_cached = cached_playlists_results.count(None) == 0
    if has_all_playlists_cached:
        return cached_playlists_results

    # Create a dict of cached playlists
    cached_playlists = {}
    cached_playlist_ids = set()
    for cached_playlist in cached_playlists_results:
        if cached_playlist:
            cached_playlists[cached_playlist['playlist_id']] = cached_playlist
            cached_playlist_ids.add(cached_playlist['playlist_id'])

    playlist_ids_to_fetch = filter(
        lambda playlist_id: playlist_id not in cached_playlist_ids, playlist_ids)

    playlists = (
        session
        .query(Playlist)
        .filter(Playlist.is_current == True)
        .filter(Playlist.playlist_id.in_(playlist_ids_to_fetch))
        .all()
    )
    playlists = helpers.query_result_to_list(playlists)
    queried_playlists = {playlist['playlist_id']: playlist for playlist in playlists}

    # cache playlists for future use
    set_playlists_in_cache(playlists)

    playlists_response = []
    for playlist_id in playlist_ids:
        if playlist_id in cached_playlists:
            playlists_response.append(cached_playlists[playlist_id])
        elif playlist_id in queried_playlists:
            playlists_response.append(queried_playlists[playlist_id])

    return playlists_response
