"""Operator-only local migration: python -m backend.claim_legacy existing-account@email.

Never expose legacy claiming as an HTTP endpoint: the prior singleton has no owner.
"""
import argparse
from sqlalchemy import select
from .database import init_db,SessionLocal
from .models import Founder,Business
from .accounts import Account,Project

def main():
    parser=argparse.ArgumentParser(description='Assign the preserved local-development project to an existing account you own.')
    parser.add_argument('email');args=parser.parse_args();init_db()
    with SessionLocal() as db:
        account=db.scalar(select(Account).where(Account.email==args.email.strip().lower()))
        founder=db.scalar(select(Founder).where(Founder.development_key=='local-development'))
        if not account or not founder:parser.error('Account or previous development founder not found. Sign up first.')
        if not db.scalar(select(Business.id).where(Business.founder_id==founder.id)):
            parser.error('The previous development founder has no business profile to claim.')
        project=db.get(Project,founder.id)
        if project and project.account_id!=account.id:parser.error('This project is already assigned to a different account.')
        if not project:
            if db.scalar(select(Project.founder_id).where(Project.account_id==account.id,Project.active.is_(True))):parser.error('This account already has an active business. No second business was created.')
            db.add(Project(founder_id=founder.id,account_id=account.id,journey='known',onboarded=True));db.commit()
        print('Preserved project assigned. Sign in and open Business projects. No roadmap, progress, or research records were changed.')
if __name__=='__main__':main()
