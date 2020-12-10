import logging
import time
from src.models import Track
from src.tasks.celery_app import celery
from src.queries.get_trending_tracks import make_trending_cache_key, generate_unpopulated_trending
from src.utils.redis_cache import pickle_and_set

logger = logging.getLogger(__name__)
time_ranges = ["week", "month", "year"]

def get_genres(session):
    """Returns all genres"""
    genres = (
        session.query(
            Track.genre
        ).distinct(
            Track.genre
        )).all()
    genres = filter(lambda x: x[0] is not None and x[0] != "", genres)
    return list(map(lambda x: x[0], genres))


def index_trending(self, db, redis):
    logger.info('index_trending.py | starting indexing')
    update_start = time.time()
    with db.scoped_session() as session:
        genres = get_genres(session)

        # Make sure to cache empty genre
        genres.append(None)

        for genre in genres:
            for time_range in time_ranges:
                cache_start_time = time.time()
                res = generate_unpopulated_trending(session, genre, time_range)
                key = make_trending_cache_key(time_range, genre)
                pickle_and_set(redis, key, res)
                cache_end_time = time.time()
                total_time = cache_end_time - cache_start_time
                logger.info(f"index_trending.py | Cached trending for {genre}-{time_range} in {total_time} seconds")
    update_end = time.time()
    update_total = update_end - update_start
    logger.info(f"index_trending.py | Finished indexing trending in {update_total} seconds")

######## CELERY TASKS ########
@celery.task(name="index_trending", bind=True)
def index_trending_task(self):
    """Caches all trending combination of time-range and genre (including no genre)."""
    db = index_trending_task.db
    redis = index_trending_task.redis
    have_lock = False
    update_lock = redis.lock("index_trending_lock", timeout=7200)
    try:
        have_lock = update_lock.acquire(blocking=False)
        if have_lock:
            index_trending(self, db, redis)
        else:
            logger.info("index_trending.py | Failed to acquire index trending lock")
    except Exception as e:
        logger.error("index_trending.py | Fatal error in main loop", exc_info=True)
        raise e
    finally:
        if have_lock:
            update_lock.release()
