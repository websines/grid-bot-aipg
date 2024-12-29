from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Boolean, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import json

# Create SQLite database engine
SQLALCHEMY_DATABASE_URL = "sqlite:///./grid_bot.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()

class GridState(Base):
    __tablename__ = "grid_states"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    positions = Column(Integer)
    total_amount = Column(Float)
    min_distance = Column(Float)
    max_distance = Column(Float)
    is_active = Column(Boolean, default=True)
    last_update = Column(DateTime, default=datetime.utcnow)
    current_price = Column(Float)
    open_orders = Column(JSON)
    balance = Column(JSON)

    @property
    def as_dict(self):
        return {
            "id": self.id,
            "symbol": self.symbol,
            "positions": self.positions,
            "total_amount": self.total_amount,
            "min_distance": self.min_distance,
            "max_distance": self.max_distance,
            "is_active": self.is_active,
            "last_update": self.last_update.isoformat(),
            "current_price": self.current_price,
            "open_orders": json.loads(self.open_orders) if self.open_orders else [],
            "balance": json.loads(self.balance) if self.balance else {}
        }

# Create database tables
Base.metadata.create_all(bind=engine)

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def save_grid_state(db, grid_params, current_price=None, open_orders=None, balance=None):
    """Save or update grid state"""
    grid_state = db.query(GridState).filter(GridState.is_active == True).first()
    
    if not grid_state:
        grid_state = GridState(
            symbol=grid_params.symbol,
            positions=grid_params.positions,
            total_amount=grid_params.total_amount,
            min_distance=grid_params.min_distance,
            max_distance=grid_params.max_distance,
            current_price=current_price,
            open_orders=json.dumps(open_orders) if open_orders else None,
            balance=json.dumps(balance) if balance else None
        )
        db.add(grid_state)
    else:
        grid_state.symbol = grid_params.symbol
        grid_state.positions = grid_params.positions
        grid_state.total_amount = grid_params.total_amount
        grid_state.min_distance = grid_params.min_distance
        grid_state.max_distance = grid_params.max_distance
        grid_state.last_update = datetime.utcnow()
        if current_price is not None:
            grid_state.current_price = current_price
        if open_orders is not None:
            grid_state.open_orders = json.dumps(open_orders)
        if balance is not None:
            grid_state.balance = json.dumps(balance)
    
    db.commit()
    return grid_state

def get_active_grid(db):
    """Get currently active grid"""
    return db.query(GridState).filter(GridState.is_active == True).first()

def stop_active_grid(db):
    """Stop active grid"""
    grid_state = get_active_grid(db)
    if grid_state:
        grid_state.is_active = False
        db.commit()
    return grid_state
