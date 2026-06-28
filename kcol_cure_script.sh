#!/usr/bin/sh
#
################################################################################
## Script Name: kcol_cure_script_acct_level.sh
## Author: Qamrul Haq Siddiqui (Amdocs)
## Date Created: 10/06/2025
##
## Usage: kcol_cure_script.sh <account_no> [account_no2 ...]
##   Creates exactly ONE process_sched row (ARM02/CURE) regardless of
##   how many account numbers are passed.
##   Single:   kcol_cure_script.sh 1430182
##   Multiple: kcol_cure_script.sh 1430182 1430183 1430184
################################################################################
. $HOME/.bash_profile

usage() {
  echo "Usage: $0 <account_no> [account_no2 ...]"
  echo "  Example: $0 1430182"
  echo "  Example: $0 1430182 1430183"
  exit 1
}

if [ $# -eq 0 ]; then
  usage
fi

ACCOUNT_LIST=""
for acct in "$@"; do
  case "$acct" in
    *[!0-9]*)
      echo "Error: invalid account number '$acct' (digits only)"
      exit 1
      ;;
  esac
  if [ -n "$ACCOUNT_LIST" ]; then
    ACCOUNT_LIST="${ACCOUNT_LIST},${acct}"
  else
    ACCOUNT_LIST="${acct}"
  fi
done

# One process_sched entry: IN (...) works for single or multiple accounts
SQL_QUERY="cmf.account_no IN (${ACCOUNT_LIST})"

DB=$DB_KENAN_SID
USER=$DB_CUSTOMAPP_UN2
PASS=$DB_KENAN_ARBINT2_PW
LOG_DIR=$CCICUSTOMDIR/collections/tenant2/daily_scripts/logs
logFileName="kcol_cure_acct_level`date '+%Y%m%d.%H%M%S'`.log"
currDate=`date '+%Y%m%d'`


#Log Function
LOGGER ()
{
        echo `date '+%m-%d-%Y %H:%M:%S:'` $1 >> $LOG_DIR/$logFileName
}


LOGGER "$0 : Process Start..."
LOGGER "$0 : Account filter: $SQL_QUERY"
LOGGER "$0 : Prepare PROCESS_SCHED jobs"

#Prepare Job on PROCESS_SCHED
sqlplus -s  <<-_EOSQL_
$USER/$PASS@$DB


delete from arbor.process_sched where process_name='ARM02';

--CURE
INSERT INTO arbor.process_sched (process_name,task_name,task_cycle,task_mode,sched_start,task_intrvl,task_status,task_priority
,slide_time,db_name,sql_query,debug_level,plat_id,usg_crt_hour,usg_plat_id,usg_version,tenant_id)
VALUES ('ARM02','CURE','N',0,SYSDATE,1440,0,0,0,'$DB_KENAN_SID','$SQL_QUERY',0,null,0,null,0,1);


COMMIT;

QUIT;

_EOSQL_

LOGGER "$0 : Process for auto-purging voluntary disconnects - start"


#Purge accounts
PRG=`sqlplus -s << EOL
$USER/$PASS@$DB
SET SERVEROUTPUT ON
SET FEEDBACK OFF
DECLARE
V_TMP VARCHAR2(200);

BEGIN
ARBINT2.KCOL_PURGE_ACCOUNT(V_TMP);
DBMS_OUTPUT.PUT_LINE(V_TMP);

END;
/



EOL`


LOGGER "$0 : $PRG"
LOGGER "$0 : Process for auto-purging voluntary disconnects - end"

#Execute Jobs

cd $ARBORBIN

export ARBORDBU=ccinne


LOGGER "$0 : Executing ARM Cure..."
ARM ARM02 3 $NS $IFR $currDate
LOGGER "$0 : ARM Cure done."
