"""Add matviews for route stats

Revision ID: 47b07608863f
Revises: d579207034fc
Create Date: 2020-11-19 14:32:18.832920

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '47b07608863f'
down_revision = 'd579207034fc'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    connection = op.get_bind()
    connection.execute('''

    --- Create matviews for easier protocol dashboard querying

    --- route metrics day
    CREATE MATERIALIZED VIEW route_metrics_day_bucket AS
	SELECT
		COUNT (DISTINCT route_metrics.ip) as "unique_count",
		SUM (route_metrics.count) as "count",
		date_trunc('day', route_metrics.timestamp) as "time"
	FROM route_metrics
	GROUP BY date_trunc('day', route_metrics.timestamp);

    --- route metrics month
    CREATE MATERIALIZED VIEW route_metrics_month_bucket AS
	SELECT
		COUNT (DISTINCT route_metrics.ip) as "unique_count",
		SUM (route_metrics.count) as "count",
		date_trunc('month', route_metrics.timestamp) as "time"
	FROM route_metrics
	GROUP BY date_trunc('month', route_metrics.timestamp);

    --- route metrics trailing week
    CREATE MATERIALIZED VIEW route_metrics_trailing_week AS
    SELECT
        COUNT (DISTINCT route_metrics.ip) as "unique_count",
        SUM (route_metrics.count) as "count"
    FROM route_metrics
    WHERE route_metrics.timestamp > now() - INTERVAL '1 WEEK';

    --- route metrics trailing month
    CREATE MATERIALIZED VIEW route_metrics_trailing_month AS
    SELECT
        COUNT (DISTINCT route_metrics.ip) as "unique_count",
        SUM (route_metrics.count) as "count"
    FROM route_metrics
    WHERE route_metrics.timestamp > now() - INTERVAL '1 MONTH';

    --- route metrics all-time
    CREATE MATERIALIZED VIEW route_metrics_all_time AS
    SELECT
        COUNT (DISTINCT route_metrics.ip) as "unique_count",
        SUM (route_metrics.count) as "count"
    FROM route_metrics;

    --- app name metrics trailing week
    CREATE MATERIALIZED VIEW app_name_metrics_trailing_week AS
    SELECT
        application_name as "name",
        SUM (app_name_metrics.count) as "count"
    FROM app_name_metrics
    WHERE app_name_metrics.timestamp > (now() - INTERVAL '1 WEEK')
    GROUP BY application_name;

    --- app name metrics trailing month
    CREATE MATERIALIZED VIEW app_name_metrics_trailing_month AS
    SELECT
        application_name as "name",
        SUM (app_name_metrics.count) as "count"
    FROM app_name_metrics
    WHERE app_name_metrics.timestamp > (now() - INTERVAL '1 MONTH')
    GROUP BY application_name;

    --- app name metrics trailing all-time
    CREATE MATERIALIZED VIEW app_name_metrics_all_time AS
    SELECT
        application_name as "name",
        SUM (app_name_metrics.count) as "count"
    FROM app_name_metrics
    GROUP BY application_name;
    ''')


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    # ### end Alembic commands ###
    connection = op.get_bind()
    connection.execute('''
    DROP MATERIALIZED VIEW route_metrics_day_bucket;
    DROP MATERIALIZED VIEW route_metrics_month_bucket;
    DROP MATERIALIZED VIEW route_metrics_trailing_week;
    DROP MATERIALIZED VIEW route_metrics_trailing_month;
    DROP MATERIALIZED VIEW route_metrics_trailing_all_time;
    DROP MATERIALIZED VIEW app_name_metrics_trailing_week;
    DROP MATERIALIZED VIEW app_name_metrics_trailing_month;
    DROP MATERIALIZED VIEW app_name_metrics_all_time;
    ''')