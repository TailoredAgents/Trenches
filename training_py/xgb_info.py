import sys, xgboost as xgb
print('python', sys.executable)
print('xgb', xgb.__version__)
print('supports_device_param', 'device' in xgb.train.__code__.co_varnames or 'device' in getattr(xgb, 'XGBClassifier', object).__init__.__code__.co_varnames)
